pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.plasma5support as Plasma5Support
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    property var quota: ({text: "Quota ?", providers: []})
    readonly property string command: "python3 -m quotacore bar --format json --providers claude,codex,gemini --window session"
    function severity(value) {
        return value === null || value === undefined ? Kirigami.Theme.disabledTextColor
             : value >= 80 ? Kirigami.Theme.negativeTextColor
             : value >= 50 ? Kirigami.Theme.neutralTextColor : Kirigami.Theme.textColor
    }
    Plasma5Support.DataSource {
        id: source
        engine: "executable"
        connectedSources: [root.command]
        interval: 30000
        onNewData: function(name, data) {
            if (data["exit code"] !== 0) { root.quota = {text: "Quota unavailable", providers: []}; return; }
            try { root.quota = JSON.parse(data.stdout); }
            catch (error) { root.quota = {text: "Quota unavailable", providers: []}; }
        }
    }
    compactRepresentation: MouseArea {
        implicitWidth: compact.implicitWidth + Kirigami.Units.smallSpacing * 2
        implicitHeight: compact.implicitHeight
        onClicked: root.expanded = !root.expanded
        Controls.ToolTip.text: root.quota.tooltip || "No snapshot available"
        Controls.ToolTip.visible: containsMouse
        hoverEnabled: true
        RowLayout {
            id: compact
            anchors.centerIn: parent
            Repeater {
                model: root.quota.providers
                Controls.Label {
                    required property var modelData
                    text: modelData.text
                    color: root.severity(modelData.percentage)
                    textFormat: Text.PlainText
                }
            }
            Controls.Label { visible: !root.quota.providers.length; text: root.quota.text }
        }
    }
    fullRepresentation: Controls.ScrollView {
        implicitWidth: Kirigami.Units.gridUnit * 24
        implicitHeight: Kirigami.Units.gridUnit * 26
        ColumnLayout {
            width: parent.width
            Repeater {
                model: root.quota.providers
                ColumnLayout {
                    id: providerRow
                    required property var modelData
                    Layout.fillWidth: true
                    Controls.Label {
                        text: providerRow.modelData.id + " · " + providerRow.modelData.state
                        font.bold: true
                        textFormat: Text.PlainText
                    }
                    Repeater {
                        model: providerRow.modelData.windows
                        Controls.Label {
                            required property var modelData
                            Layout.fillWidth: true
                            text: modelData.text
                            color: root.severity(modelData.used_percent)
                            wrapMode: Text.Wrap
                            textFormat: Text.PlainText
                        }
                    }
                }
            }
            Controls.Label { visible: !root.quota.providers.length; text: root.quota.text }
        }
    }
}
