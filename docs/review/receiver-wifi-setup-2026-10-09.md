# Receiver Wi-Fi setup correction

The earlier receiver was bound to loopback, so its dashboard offered USB and emulator setup. Android already accepts a private-network receiver address; importing USB setup does not select Wi-Fi automatically.

Added `scripts/start-activity-receiver.ps1`: the user's foreground receiver supports Wi-Fi by default, with `-LocalOnly` for USB/emulator use and Ctrl+C to stop. The dashboard now explains unavailable Wi-Fi on a loopback receiver, exports detected private-network Wi-Fi setup files/addresses, and includes complete USB debugging and port-reversal instructions with the actual selected port. The [sender guide](../../android/publisher-app/README.md) contains both workflows. No APK change or new Android validation claim is introduced; the 0.3.1 emulator review remains historical evidence for its exact sources at that time.

[Actual receiver verification](../../artifacts/activity-receiver-wifi-check/validation.json) checked authenticated setup, Wi-Fi availability and requests over the detected LAN address, loopback-only guidance, and USB instructions matching the configured port. The [dashboard preview](../../artifacts/activity-receiver-wifi-check/dashboard-wifi.png) shows Phone on Wi-Fi at the detected address. This verifies the receiver from the computer; physical-phone routing/firewall access still requires a phone trial.

The agent-owned receiver on port 8765 was stopped at the user's request. Temporary isolated verification receivers were closed afterward. The user owns starting and stopping their receiver; no firewall settings were changed.

The initial launcher contained a UTF-8 em dash that Windows PowerShell 5.1 decoded as a quote, causing an unterminated string. Replaced it with an ASCII hyphen and kept the launcher ASCII. Reproduced the original parser error using Windows PowerShell 5.1, then verified the corrected parser and actual launcher startup in that shell. Dashboard HTTP 200, authenticated Wi-Fi setup and requests over the detected LAN address passed. The temporary process tree was stopped and port 8765 was confirmed free. [Windows PowerShell startup result](../../artifacts/activity-receiver-wifi-check/windows-powershell-startup-validation.json).

## Next steps

The user can start the Wi-Fi receiver and import its setup into the existing Android APK. Native development can continue independently; no approval is required. A phone Wi-Fi trial is needed to confirm connectivity across the user's actual network.
