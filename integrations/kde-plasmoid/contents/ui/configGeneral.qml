import QtQuick
import QtQuick.Controls as Controls
import org.kde.kirigami as Kirigami

Kirigami.FormLayout {
    property alias cfg_claudeEnabled: claude.checked
    property alias cfg_codexEnabled: codex.checked
    property alias cfg_geminiEnabled: gemini.checked
    property alias cfg_windowMode: windowMode.currentIndex
    property alias cfg_miniBarType: miniBar.currentIndex
    property alias cfg_severityColors: severityColors.currentIndex
    property alias cfg_refreshInterval: interval.value
    Controls.CheckBox { id: claude; Kirigami.FormData.label: "Providers:"; text: "Claude" }
    Controls.CheckBox { id: codex; text: "Codex" }
    Controls.CheckBox { id: gemini; text: "Gemini" }
    Controls.ComboBox { id: windowMode; Kirigami.FormData.label: "Quota window:"; model: ["Session", "Weekly", "Both"] }
    Controls.ComboBox { id: miniBar; Kirigami.FormData.label: "Mini bar:"; model: ["Bar", "Dots", "None"] }
    Controls.ComboBox { id: severityColors; Kirigami.FormData.label: "Severity colors:"; model: ["Classic", "Color scheme"] }
    Controls.SpinBox { id: interval; Kirigami.FormData.label: "Read interval (seconds):"; from: 10; to: 3600 }
}
