pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as Plasma5Support
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    property var quota: ({providers: []})
    property string error: ""
    property bool refreshing: false
    property double clock: Date.now()
    readonly property bool vertical: Plasmoid.formFactor === PlasmaCore.Types.Vertical
    readonly property var config: Plasmoid.configuration
    readonly property string resolver: "if command -v quotacore >/dev/null 2>&1; then quotacore ";
    function launch(args) {
        return resolver + args + "; elif command -v python3 >/dev/null 2>&1 && python3 -c 'import quotacore' >/dev/null 2>&1; then python3 -m quotacore " + args + "; else printf '%s\\n' 'Quota unavailable — install the quotacore package or install quotacore for python3.'; exit 127; fi";
    }
    readonly property string providerIds: ["claude", "codex", "gemini"].filter(function(id) { return root.config[id + "Enabled"]; }).join(",")
    readonly property string windowKind: ["session", "weekly", "both"][root.config.windowMode] || "session"
    readonly property string command: launch("bar --format json --window " + windowKind + (providerIds ? " --providers " + providerIds : ""))
    readonly property string refreshCommand: launch("write")
    readonly property var providers: providerIds ? quota.providers || [] : []
    readonly property color schemeBackground: Kirigami.Theme.backgroundColor
    readonly property bool lightBackground: (0.2126 * schemeBackground.r + 0.7152 * schemeBackground.g + 0.0722 * schemeBackground.b) > 0.5
    readonly property color warningColor: config.severityColors === 1 ? Kirigami.Theme.neutralTextColor : lightBackground ? "#925C00" : "#E8A317"
    readonly property color dangerColor: config.severityColors === 1 ? Kirigami.Theme.negativeTextColor : lightBackground ? "#B4232B" : "#E5484D"
    readonly property bool mono: config.severityColors === 2
    readonly property color ink: lightBackground ? "#000000" : "#ffffff"
    readonly property color paper: lightBackground ? "#ffffff" : "#000000"
    readonly property int dotCount: [10,20,30].includes(config.dotCount) ? config.dotCount : 20
    function severity(value) {
        if (mono) return ink;
        return value === null || value === undefined ? Kirigami.Theme.disabledTextColor
             : value >= 80 ? dangerColor
             : value >= 50 ? warningColor : Kirigami.Theme.textColor
    }
    function visibleWindows(provider) {
        return (provider.windows || []).filter(function(w) { return !w.hidden && !w.hidden_by_default && Number.isFinite(w.used_percent); });
    }
    function age() {
        const time = Date.parse(quota.generated_at || "");
        if (!Number.isFinite(time)) return "No snapshot yet";
        const minutes = Math.max(0, Math.floor((clock - time) / 60000));
        return minutes < 1 ? "Updated just now" : "Updated " + (minutes < 60 ? minutes + "m" : Math.floor(minutes / 60) + "h") + " ago";
    }
    function refresh() {
        if (refreshing) return;
        refreshing = true;
        writer.connectSource(refreshCommand);
    }
    Timer { interval: 15000; running: true; repeat: true; onTriggered: root.clock = Date.now() }
    Plasma5Support.DataSource {
        id: source
        engine: "executable"
        connectedSources: [root.command]
        interval: Math.max(10, root.config.refreshInterval) * 1000
        onNewData: function(name, data) {
            if (data["exit code"] !== 0) { root.error = "Quota unavailable — install quotacore and check its snapshot."; return; }
            try { root.quota = JSON.parse(data.stdout); root.error = ""; }
            catch (error) { root.error = "Unable to read quota data. Run quotacore write."; }
        }
    }
    Plasma5Support.DataSource {
        id: writer
        engine: "executable"
        onNewData: function(name, data) {
            disconnectSource(name);
            root.refreshing = false;
            if (data["exit code"] !== 0) { root.error = "Refresh failed. Check quotacore installation and provider access."; return; }
            source.disconnectSource(root.command);
            source.connectSource(root.command);
        }
    }
    component DotStrip: Row {
        id: strip
        required property int count
        required property var percent
        property real dotSize: Kirigami.Theme.defaultFont.pixelSize * 0.35
        spacing: Kirigami.Theme.defaultFont.pixelSize * 0.15
        Repeater {
            model: strip.count
            Rectangle {
                required property int index
                width: strip.dotSize; height: width; radius: width / 2
                readonly property bool hollow: root.mono && strip.percent >= 50 && index < Math.round(strip.percent * strip.count / 100) && index >= Math.floor(strip.count / 2) - 1
                border.width: hollow ? 1 : 0
                border.color: root.ink
                color: hollow ? root.paper : index < Math.round((strip.percent || 0) * strip.count / 100) ? root.severity(strip.percent) : Kirigami.Theme.textColor
                opacity: index < Math.round((strip.percent || 0) * strip.count / 100) ? 1 : 0.12
            }
        }
    }
    compactRepresentation: MouseArea {
        id: compactArea
        readonly property bool stacked: root.vertical || height >= 40
        implicitWidth: root.vertical ? 64 : compactGrid.implicitWidth + 12
        implicitHeight: compactGrid.implicitHeight + 4
        onClicked: root.expanded = !root.expanded
        Controls.ToolTip.text: root.error || root.quota.tooltip || "No snapshot available — run quotacore write"
        Controls.ToolTip.visible: containsMouse
        hoverEnabled: true
        GridLayout {
            id: compactGrid
            anchors.centerIn: parent
            columns: root.vertical ? 1 : Math.max(1, Math.ceil(root.providers.length / (compactArea.stacked ? Math.min(3, Math.max(1, Math.floor(compactArea.height / 18))) : 1)))
            rowSpacing: 0; columnSpacing: 10
            Repeater {
                model: root.providers
                ColumnLayout {
                    id: mini
                    required property var modelData
                    spacing: 1
                    RowLayout {
                        spacing: 4
                        Controls.Label { text: mini.modelData.short; font.family: "monospace"; font.pixelSize: 11; textFormat: Text.PlainText }
                        Controls.Label {
                            text: (mini.modelData.percentage === null ? "?" : Math.round(mini.modelData.percentage) + "%") + (mini.modelData.stale ? "*" : "")
                            color: root.mono && mini.modelData.percentage >= 80 ? root.paper : root.severity(mini.modelData.percentage)
                            background: Rectangle { radius: 3; color: root.mono && mini.modelData.percentage >= 80 ? root.ink : "transparent" }
                            font.family: "monospace"; font.pixelSize: 11; textFormat: Text.PlainText
                        }
                    }
                    Rectangle {
                        visible: !root.mono && root.config.miniBarType === 0
                        Layout.fillWidth: true
                        implicitHeight: 2; color: Kirigami.Theme.alternateBackgroundColor
                        Rectangle { height: 2; width: parent.width * (mini.modelData.percentage || 0) / 100; color: root.severity(mini.modelData.percentage) }
                    }
                    DotStrip { visible: root.config.miniBarType === 1 || (root.mono && root.config.miniBarType === 0); count: root.dotCount; percent: mini.modelData.percentage; dotSize: Kirigami.Theme.defaultFont.pixelSize * 0.18 }
                }
            }
            Controls.Label { visible: !root.providers.length; text: root.error ? "Quota !" : "Quota —"; textFormat: Text.PlainText }
        }
    }
    fullRepresentation: ColumnLayout {
        implicitWidth: Kirigami.Units.gridUnit * 22
        implicitHeight: Kirigami.Units.gridUnit * 27
        spacing: 10
        Controls.Label { text: "AI USAGE  /  USAGE"; font.family: "monospace"; font.bold: true; Layout.margins: 12 }
        Controls.Label {
            visible: !!root.error || !root.providers.length || !root.quota.generated_at
            text: root.error || (!root.quota.generated_at && root.providerIds ? "No snapshot yet. Choose Refresh or run quotacore write." : root.providerIds ? "No active quota windows. Run quotacore write to create a snapshot." : "Choose providers in the widget settings.")
            wrapMode: Text.Wrap; textFormat: Text.PlainText
            Layout.fillWidth: true; Layout.margins: 12
        }
        Controls.ScrollView {
            id: scroll
            Layout.fillWidth: true; Layout.fillHeight: true
            contentWidth: availableWidth
            ColumnLayout {
                width: scroll.availableWidth
                spacing: 10
                Repeater {
                    model: root.providers
                    Rectangle {
                        id: card
                        required property var modelData
                        Layout.fillWidth: true
                        implicitHeight: cardContent.implicitHeight + 24
                        radius: 10
                        color: root.mono ? root.paper : Kirigami.Theme.backgroundColor
                        border.color: Kirigami.Theme.disabledTextColor
                        ColumnLayout {
                            id: cardContent
                            anchors { fill: parent; margins: 12 }
                            spacing: 8
                            RowLayout {
                                Layout.fillWidth: true
                                Controls.Label { text: card.modelData.label; font.bold: true; font.family: "monospace"; textFormat: Text.PlainText; Layout.fillWidth: true }
                                Controls.Label { visible: !!card.modelData.plan; text: card.modelData.plan || ""; font.pixelSize: 10; textFormat: Text.PlainText; padding: 4; color: root.mono ? root.ink : Kirigami.Theme.textColor; background: Rectangle { radius: 4; border.width: root.mono ? 1 : 0; border.color: root.ink; color: root.mono ? root.paper : Kirigami.Theme.alternateBackgroundColor } }
                                Controls.Label { visible: card.modelData.state !== "OK" || card.modelData.stale; text: card.modelData.stale && card.modelData.state === "OK" ? "STALE" : card.modelData.state; font.pixelSize: 10; textFormat: Text.PlainText; padding: 4; color: root.mono ? root.ink : Kirigami.Theme.textColor; background: Rectangle { radius: 4; border.width: root.mono ? 1 : 0; border.color: root.ink; color: root.mono ? root.paper : Kirigami.Theme.alternateBackgroundColor } }
                            }
                            Repeater {
                                model: root.visibleWindows(card.modelData)
                                ColumnLayout {
                                    id: quotaWindow
                                    required property var modelData
                                    Layout.fillWidth: true
                                    spacing: 6
                                    RowLayout {
                                        Layout.fillWidth: true
                                        Controls.Label { text: quotaWindow.modelData.label; textFormat: Text.PlainText; Layout.fillWidth: true; elide: Text.ElideRight }
                                        Controls.Label { text: Math.round(quotaWindow.modelData.used_percent) + "%"; color: root.mono && quotaWindow.modelData.used_percent >= 80 ? root.paper : root.severity(quotaWindow.modelData.used_percent); padding: 2; background: Rectangle { radius: 3; color: root.mono && quotaWindow.modelData.used_percent >= 80 ? root.ink : "transparent" } font.family: "monospace"; textFormat: Text.PlainText }
                                    }
                                    DotStrip { count: root.dotCount; percent: quotaWindow.modelData.used_percent }
                                    Controls.Label { text: quotaWindow.modelData.remaining === "?" ? "Reset time unknown" : "Resets in " + quotaWindow.modelData.remaining; opacity: 0.65; font.pixelSize: 11; textFormat: Text.PlainText }
                                }
                            }
                            Controls.Label { visible: !root.visibleWindows(card.modelData).length; text: "No quota data available"; opacity: 0.65 }
                        }
                    }
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true; Layout.margins: 12
            Controls.Label { text: root.age(); opacity: 0.65; Layout.fillWidth: true }
            Controls.Button { text: root.refreshing ? "Refreshing…" : "Refresh"; enabled: !root.refreshing; onClicked: root.refresh() }
        }
    }
}
