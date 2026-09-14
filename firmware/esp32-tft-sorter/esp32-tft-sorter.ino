/*
  Combined sketch: TFT touch WiFi manager + existing sorter/backend logic
  -------------------------------------------------------------------------
  THIS REVISION:
    - Portrait orientation: tft.setRotation(2)
    - Password keyboard is now NUMERIC ONLY (phone-dialer style: 1-9, DEL,
      0, GO), with bigger digit buttons since there's no letter rows to
      fit anymore. NOTE: this means only all-numeric WiFi passwords can
      be typed on-device now.
    - WiFi network list row count is now calculated from the actual
      screen height instead of a fixed number, so it fills a portrait
      panel properly instead of leaving a big gap or overflowing.
    - Running-screen header text shortened to fit the narrower portrait
      width alongside the WiFi settings button.
    Everything else (theme colors, splash screen, sorter state machine,
    WiFi/backend logic, pin assignments) is unchanged.

  COLOR PASS: THEME_BLUE_DARK and THEME_BORDER were slightly off the
  actual Ceres brand hex codes (approximated by hand); recomputed here to
  the exact RGB565 values for #1E40AF / #E5E7EB. TFT_RED/TFT_GREEN status
  text swapped for THEME_DANGER/THEME_SUCCESS (same brand-matched method)
  instead of the raw saturated TFT_eSPI named colors. Nothing else changed.
*/

#include <SPI.h>
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <HTTPClient.h>

TFT_eSPI tft = TFT_eSPI();

// ── Theme colors (RGB565), precisely matching the Ceres brand palette ─────
#define THEME_BLUE        0x1A7B  // #1D4ED8 - main body background
#define THEME_BLUE_DARK   0x1A15  // #1E40AF - header bar + primary/CTA buttons
#define THEME_BLUE_LIGHT  0xDF5F  // #DBEAFE - subtle pill fills
#define THEME_WHITE       TFT_WHITE
#define THEME_BORDER      0xE73D  // #E5E7EB - card/pill borders
#define THEME_SUCCESS     0x1509  // #16A34A - connected/OK status text
#define THEME_DANGER      0xD924  // #DC2626 - error/disconnected status text
#define HEADER_H           34

// Small helper to draw a consistent rounded, centered-label button
void drawButton(int x, int y, int w, int h, uint16_t fillColor, uint16_t textColor,
                 uint16_t borderColor, const char* label, uint8_t textSize = 2) {
  tft.fillRoundRect(x, y, w, h, 6, fillColor);
  tft.drawRoundRect(x, y, w, h, 6, borderColor);
  tft.setTextColor(textColor, fillColor);
  tft.setTextSize(textSize);
  int textW = strlen(label) * 6 * textSize;
  int tx = x + (w - textW) / 2;
  int ty = y + (h - 8 * textSize) / 2;
  tft.setCursor(tx, ty);
  tft.print(label);
}

// ── Hosted backend (unchanged — device identity, not per-network) ─────────
const char* BACKEND_HOST        = "ceresweb-1.onrender.com"; // ← your Render hostname, no https://, no trailing slash
const uint16_t BACKEND_PORT     = 443;
const char* ESP32_SHARED_SECRET = "IEuiRcH0CegbnVXTXOjiRl754MRXJP0E"; // ← must match Render's ESP32_SHARED_SECRET

// ── Motor / sensor pins (unchanged) ────────────────────────────────────────
#define IN1    27
#define IN2    14
#define IR_PIN 33
#define ENA    32

// ── Buzzer pins (unchanged) ────────────────────────────────────────────────
#define BUZZER_PIN     25
#define BUZZER_GND_PIN 26

// ── WebSocket client to the hosted backend ──────────────────────────────────
WebSocketsClient webSocket;

// ── Sorter state machine (unchanged from your working code) ────────────────
enum State {
  SPINNING,
  SCANNING,
  WAITING_FOR_APP,
  WAIT_FOR_GAP,
  WAIT_FOR_NEXT_PAPER,
  ERROR_PAUSED
};

State currentState = SPINNING;
unsigned long scanTimer = 0;
unsigned long gapTimer  = 0;
unsigned long waitStart = 0;
unsigned long lastBackendWarn = 0;
const unsigned long GAP_CONFIRM  = 200;
const unsigned long MOTOR_SETTLE = 1500;   // belt + paper must come to a full stop before we capture
const unsigned long APP_TIMEOUT  = 180000; // backstop — the OCR step alone can take up to 120 s

volatile bool appScanComplete = false;
volatile bool appScanFailed   = false;
volatile bool appScanFlagged  = false;

bool backendConnected = false;
bool backendStarted   = false; // only call webSocket.beginSSL() once

// ── Buzzer helper (unchanged) ───────────────────────────────────────────────
void beep(int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(onMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < times - 1) delay(offMs);
  }
}

// ── Motor helpers (unchanged) ───────────────────────────────────────────────
void motorForward() {
  analogWrite(ENA, 150);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void motorStop() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, HIGH);
  analogWrite(ENA, 255);
}

void drawRunningStatus(); // fwd decl (used in onWsEvent, unchanged behavior — just redraws)

// ── WebSocket event handler (unchanged logic) ────────────────────────────────
void onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {

    case WStype_CONNECTED:
      backendConnected = true;
      Serial.println("Connected to backend");
      drawRunningStatus();
      break;

    case WStype_DISCONNECTED:
      Serial.println("Disconnected from backend");
      backendConnected = false;
      if (currentState == WAITING_FOR_APP) {
        appScanFailed = true;
      }
      drawRunningStatus();
      break;

    case WStype_TEXT: {
      String msg = "";
      for (size_t i = 0; i < length; i++) msg += (char)payload[i];
      msg.trim();
      Serial.printf("Received from backend: %s\n", msg.c_str());

      // Only accept a result while we are actually waiting for one. The backend
      // and the phone each send their own SCAN_COMPLETE for the same sheet, so
      // without this gate the second one leaves a stale flag that the *next*
      // paper consumes instantly — resuming the belt before it's been captured.
      if (msg == "SCAN_COMPLETE") {
        if (currentState == WAITING_FOR_APP) appScanComplete = true;

      } else if (msg == "SCAN_FLAGGED") {
        if (currentState == WAITING_FOR_APP) appScanFlagged = true;

      } else if (msg == "SCAN_FAILED") {
        if (currentState == WAITING_FOR_APP) appScanFailed = true;

      } else if (msg == "RESUME") {
        if (currentState == ERROR_PAUSED) {
          motorForward();
          currentState = WAIT_FOR_GAP;
          gapTimer = 0;
          Serial.println("Operator resumed. Motor forward. Waiting for gap.");
        }
      }
      break;
    }

    default:
      break;
  }
}

// ── Start backend connection (unchanged) ────────────────────────────────────
void startBackend() {
  if (backendStarted) return;
  String path = String("/ws/esp32?token=") + ESP32_SHARED_SECRET;
  webSocket.beginSSL(BACKEND_HOST, BACKEND_PORT, path.c_str());
  webSocket.onEvent(onWsEvent);
  webSocket.setReconnectInterval(5000);
  backendStarted = true;
  Serial.println("Connecting to backend WebSocket...");
}

// ── Device state machine (unchanged logic) ──────────────────────────────────
void runDeviceLogic() {
  webSocket.loop();

  int ir = digitalRead(IR_PIN);

  switch (currentState) {

    case SPINNING:
      if (ir == LOW) {
        motorStop();
        scanTimer = millis();
        currentState = SCANNING;
        Serial.println("Paper detected. Motor stopped.");
      }
      break;

    case SCANNING:
      if (millis() - scanTimer >= MOTOR_SETTLE) {
        // Sheet slid past while the belt was braking — nothing to capture.
        if (ir == HIGH) {
          Serial.println("Paper gone after settling. Resuming motor.");
          motorForward();
          gapTimer = 0;
          currentState = WAIT_FOR_GAP;
          break;
        }

        // Hold the brake rather than letting an unscanned sheet through.
        // Stays in SCANNING and retries once the backend is back.
        if (!backendConnected) {
          if (millis() - lastBackendWarn >= 1000) {
            lastBackendWarn = millis();
            Serial.println("Backend not connected. Holding paper, waiting...");
          }
          break;
        }

        webSocket.sendTXT("PAPER_DETECTED");
        Serial.println("Sent PAPER_DETECTED. Waiting for app...");
        appScanComplete = false;
        appScanFlagged  = false;
        appScanFailed   = false;
        waitStart = millis();
        currentState = WAITING_FOR_APP;
      }
      break;

    case WAITING_FOR_APP:
      if (appScanFlagged) {
        appScanFlagged = false;
        beep(1, 300, 0);
        motorForward();
        gapTimer = 0;
        currentState = WAIT_FOR_GAP;
        Serial.println("Sheet flagged. Beeped. Motor forward.");

      } else if (appScanComplete) {
        appScanComplete = false;
        motorForward();
        gapTimer = 0;
        currentState = WAIT_FOR_GAP;
        Serial.println("Scan complete. Motor forward. Waiting for gap.");

      } else if (appScanFailed) {
        appScanFailed = false;
        beep(3, 200, 200);
        currentState = ERROR_PAUSED;
        Serial.println("Scan failed. Motor stopped. Waiting for operator.");

      } else if (millis() - waitStart >= APP_TIMEOUT) {
        // A result can be lost if the phone's socket drops mid-upload, which
        // would otherwise stall the belt forever with no operator feedback.
        beep(3, 200, 200);
        currentState = ERROR_PAUSED;
        Serial.println("Timed out waiting for app. Motor stopped. Waiting for operator.");
      }
      break;

    case WAIT_FOR_GAP:
      if (ir == HIGH) {
        if (gapTimer == 0) gapTimer = millis();
        if (millis() - gapTimer >= GAP_CONFIRM) {
          currentState = WAIT_FOR_NEXT_PAPER;
          Serial.println("Gap confirmed. Armed for next paper.");
        }
      } else {
        gapTimer = 0;
      }
      break;

    case WAIT_FOR_NEXT_PAPER:
      if (ir == LOW) {
        motorStop();
        scanTimer = millis();
        currentState = SCANNING;
        Serial.println("Next paper detected. Motor stopped.");
      }
      break;

    case ERROR_PAUSED:
      break;
  }
}

// =====================================================================
// ============================ TFT WIFI UI ============================
// =====================================================================

uint16_t calData[5];

enum UIState { UI_SPLASH, UI_CALIBRATE, UI_WIFI_SCANNING, UI_WIFI_LIST, UI_WIFI_KEYBOARD, UI_WIFI_CONNECTING, UI_RUNNING, UI_WIFI_FAILED };
UIState uiState = UI_SPLASH;

#define MAX_NETWORKS 30
String  ssidList[MAX_NETWORKS];
int32_t rssiList[MAX_NETWORKS];
bool    openList[MAX_NETWORKS];
int networkCount = 0;
int listScrollOffset = 0;
#define ROW_HEIGHT 34
#define LIST_TOP 40
int rowsPerPage = 6; // recalculated in setup() from actual screen height

int selectedNetwork = -1;
String wifiPassword = "";
#define MAX_PASSWORD_LEN 63
bool hasInternet = false;
bool showPassword = false;

int keyW, keyH;

unsigned long connectStart = 0;
unsigned long lastStatusRefresh = 0;

// Header bar: slightly darker navy than the body, so titles still read
// clearly even though the whole screen is blue now.
void drawHeader(const String &title) {
  tft.fillRect(0, 0, tft.width(), HEADER_H, THEME_BLUE_DARK);
  tft.setTextColor(THEME_WHITE, THEME_BLUE_DARK);
  tft.setTextSize(2);
  tft.setCursor(8, 9);
  tft.print(title);
}

// ── Splash screen: simple "CERES" reveal + loading bar animation ──────────
void drawSplashScreen() {
  tft.fillScreen(THEME_BLUE);

  String word = "CERES";
  uint8_t sz = 4;
  int charW = 6 * sz;
  int totalWidth = word.length() * charW;
  int startX = (tft.width() - totalWidth) / 2;
  int y = tft.height() / 2 - (8 * sz) / 2 - 10;

  tft.setTextSize(sz);
  for (uint16_t i = 0; i < word.length(); i++) {
    tft.setTextColor(THEME_WHITE, THEME_BLUE);
    tft.setCursor(startX + i * charW, y);
    tft.print(word[i]);
    delay(140);
  }

  delay(250);

  int barY = y + 8 * sz + 20;
  int barX = startX;
  int barW = totalWidth;
  int barH = 5;
  tft.drawRoundRect(barX, barY, barW, barH, 2, THEME_WHITE);
  for (int w = 0; w <= barW - 2; w += 4) {
    tft.fillRoundRect(barX + 1, barY + 1, w, barH - 2, 1, THEME_WHITE);
    delay(6);
  }

  delay(300);
}

void runCalibration() {
  tft.fillScreen(THEME_BLUE);
  tft.setTextColor(THEME_WHITE, THEME_BLUE);
  tft.setTextSize(2);
  tft.setCursor(10, 10);
  tft.println("Touch each corner");
  tft.println("as it's marked");
  tft.calibrateTouch(calData, THEME_WHITE, THEME_BLUE, 15); // white crosshairs on blue
  tft.setTouch(calData);
}

void scanWifiNetworks() {
  tft.fillScreen(THEME_BLUE);
  drawHeader("Scanning WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  int n = WiFi.scanNetworks();
  networkCount = (n > 0) ? min(n, MAX_NETWORKS) : 0;
  for (int i = 0; i < networkCount; i++) {
    ssidList[i] = WiFi.SSID(i);
    rssiList[i] = WiFi.RSSI(i);
    openList[i] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
  }
  listScrollOffset = 0;
  uiState = UI_WIFI_LIST;
}

void drawNetworkList() {
  tft.fillScreen(THEME_BLUE);
  drawHeader("Select WiFi");

  if (networkCount == 0) {
    tft.setTextColor(THEME_WHITE, THEME_BLUE);
    tft.setTextSize(2);
    tft.setCursor(10, 60);
    tft.println("No networks found");
  }

  int y = LIST_TOP;
  int shown = 0;
  for (int i = listScrollOffset; i < networkCount && shown < rowsPerPage; i++, shown++) {
    // rows stay as white cards on the blue body so they read as tappable
    tft.fillRoundRect(4, y, tft.width() - 8, ROW_HEIGHT - 4, 6, THEME_WHITE);
    tft.drawRoundRect(4, y, tft.width() - 8, ROW_HEIGHT - 4, 6, THEME_WHITE);
    tft.setTextSize(2);
    tft.setTextColor(THEME_BLUE_DARK, THEME_WHITE);
    tft.setCursor(12, y + 8);
    String label = ssidList[i];
    if (label.length() > 13) label = label.substring(0, 13) + "..";
    tft.print(label);

    // status pill
    int pillW = 54, pillH = 18;
    int pillX = tft.width() - pillW - 10;
    int pillY = y + (ROW_HEIGHT - 4 - pillH) / 2;
    if (openList[i]) {
      tft.fillRoundRect(pillX, pillY, pillW, pillH, 8, THEME_BLUE_LIGHT);
      tft.setTextColor(THEME_BLUE, THEME_BLUE_LIGHT);
    } else {
      tft.fillRoundRect(pillX, pillY, pillW, pillH, 8, THEME_WHITE);
      tft.drawRoundRect(pillX, pillY, pillW, pillH, 8, THEME_BORDER);
      tft.setTextColor(THEME_BLUE_DARK, THEME_WHITE);
    }
    tft.setTextSize(1);
    tft.setCursor(pillX + 8, pillY + 5);
    tft.print(openList[i] ? "OPEN" : "LOCK");
    y += ROW_HEIGHT;
  }

  int navY = tft.height() - 34;
  int navBtnW = tft.width() / 3 - 6;
  drawButton(4, navY, navBtnW, 28, THEME_WHITE, THEME_BLUE, THEME_WHITE, "UP");
  drawButton(tft.width() / 3 + 2, navY, navBtnW, 28, THEME_WHITE, THEME_BLUE, THEME_WHITE, "DOWN");
  // primary action -> darker navy fill so it doesn't blend into the blue body
  drawButton(2 * tft.width() / 3, navY, navBtnW, 28, THEME_BLUE_DARK, THEME_WHITE, THEME_BLUE_DARK, "RESCAN");
}

void connectToWifi(String ssid, String pass); // fwd decl

void handleListTouch(uint16_t tx, uint16_t ty) {
  int navY = tft.height() - 34;
  if (ty >= navY) {
    if (tx < tft.width() / 3) {
      if (listScrollOffset > 0) listScrollOffset--;
      drawNetworkList();
    } else if (tx < 2 * tft.width() / 3) {
      if (listScrollOffset + rowsPerPage < networkCount) listScrollOffset++;
      drawNetworkList();
    } else {
      scanWifiNetworks();
      drawNetworkList();
    }
    return;
  }

  int rowIndex = (ty - LIST_TOP) / ROW_HEIGHT;
  int idx = listScrollOffset + rowIndex;
  if (rowIndex >= 0 && rowIndex < rowsPerPage && idx < networkCount) {
    selectedNetwork = idx;
    wifiPassword = "";
    if (openList[idx]) {
      connectToWifi(ssidList[idx], "");
    } else {
      showPassword = false;
      uiState = UI_WIFI_KEYBOARD;
      drawKeyboard();
    }
  }
}

#define TOGGLE_BTN_W 70
#define TOGGLE_BTN_H 22
#define KEYPAD_COLS 3
#define KEYPAD_ROWS 4

int keypadTop; // top Y of the numeric grid, computed each time drawKeyboard() runs

// Numeric keypad, dialer style:
//   1 2 3
//   4 5 6
//   7 8 9
//  DEL 0 GO
void drawKeyboard() {
  tft.fillScreen(THEME_BLUE);
  drawHeader("Pass: " + ssidList[selectedNetwork]);

  // password field — white input box on the blue body
  int fieldX = 6, fieldY = HEADER_H + 6, fieldW = tft.width() - TOGGLE_BTN_W - 22, fieldH = 24;
  tft.fillRoundRect(fieldX, fieldY, fieldW, fieldH, 4, THEME_WHITE);
  tft.drawRoundRect(fieldX, fieldY, fieldW, fieldH, 4, THEME_WHITE);
  tft.setTextSize(2);
  tft.setTextColor(THEME_BLUE_DARK, THEME_WHITE);
  tft.setCursor(fieldX + 6, fieldY + 4);
  if (showPassword) {
    tft.print(wifiPassword);
  } else {
    String masked = "";
    for (uint16_t i = 0; i < wifiPassword.length(); i++) masked += "*";
    tft.print(masked);
  }

  // show/hide toggle
  int toggleX = tft.width() - TOGGLE_BTN_W - 6, toggleY = HEADER_H + 6;
  if (showPassword) {
    drawButton(toggleX, toggleY, TOGGLE_BTN_W, TOGGLE_BTN_H, THEME_BLUE_DARK, THEME_WHITE, THEME_BLUE_DARK, "HIDE", 1);
  } else {
    drawButton(toggleX, toggleY, TOGGLE_BTN_W, TOGGLE_BTN_H, THEME_WHITE, THEME_BLUE, THEME_WHITE, "SHOW", 1);
  }

  // numeric keypad grid, sized to fill remaining screen height (bigger in portrait)
  keypadTop = fieldY + fieldH + 14;
  int availH = tft.height() - keypadTop - 8;
  keyW = tft.width() / KEYPAD_COLS;
  keyH = availH / KEYPAD_ROWS;

  const char* labels[12] = { "1","2","3","4","5","6","7","8","9","DEL","0","GO" };

  for (int r = 0; r < KEYPAD_ROWS; r++) {
    for (int c = 0; c < KEYPAD_COLS; c++) {
      int idx = r * KEYPAD_COLS + c;
      int x = c * keyW;
      int y = keypadTop + r * keyH;
      bool isDigit = (idx < 9) || (idx == 10); // 1-9 and 0
      if (isDigit) {
        // big white digit key
        tft.fillRoundRect(x + 3, y + 3, keyW - 6, keyH - 6, 8, THEME_WHITE);
        tft.setTextColor(THEME_BLUE_DARK, THEME_WHITE);
        tft.setTextSize(3);
        int textW = strlen(labels[idx]) * 6 * 3;
        tft.setCursor(x + (keyW - textW) / 2, y + (keyH - 24) / 2);
        tft.print(labels[idx]);
      } else if (idx == 9) {
        // DEL
        drawButton(x + 3, y + 3, keyW - 6, keyH - 6, THEME_WHITE, THEME_BLUE_DARK, THEME_WHITE, "DEL", 2);
      } else {
        // GO — primary action
        drawButton(x + 3, y + 3, keyW - 6, keyH - 6, THEME_BLUE_DARK, THEME_WHITE, THEME_BLUE_DARK, "GO", 2);
      }
    }
  }
}

void handleKeyboardTouch(uint16_t tx, uint16_t ty) {
  // show/hide toggle
  int toggleX = tft.width() - TOGGLE_BTN_W - 6, toggleY = HEADER_H + 6;
  if (tx >= toggleX && tx < toggleX + TOGGLE_BTN_W && ty >= toggleY && ty < toggleY + TOGGLE_BTN_H) {
    showPassword = !showPassword;
    drawKeyboard();
    return;
  }

  if (ty < keypadTop) return;
  int row = (ty - keypadTop) / keyH;
  int col = tx / keyW;
  if (row < 0 || row >= KEYPAD_ROWS || col < 0 || col >= KEYPAD_COLS) return;
  int idx = row * KEYPAD_COLS + col;

  if (idx < 9) {
    if (wifiPassword.length() < MAX_PASSWORD_LEN) wifiPassword += String(idx + 1);
    drawKeyboard();
  } else if (idx == 9) { // DEL
    if (wifiPassword.length() > 0) wifiPassword.remove(wifiPassword.length() - 1);
    drawKeyboard();
  } else if (idx == 10) { // 0
    if (wifiPassword.length() < MAX_PASSWORD_LEN) wifiPassword += "0";
    drawKeyboard();
  } else { // GO
    connectToWifi(ssidList[selectedNetwork], wifiPassword);
  }
}

bool checkInternet() {
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.begin("http://www.gstatic.com/generate_204");
  int code = http.GET();
  http.end();
  return (code == 204 || code == 200);
}

void connectToWifi(String ssid, String pass) {
  tft.fillScreen(THEME_BLUE);
  drawHeader("Connecting...");
  tft.setTextSize(2);
  tft.setTextColor(THEME_WHITE, THEME_BLUE);
  tft.setCursor(10, 50);
  tft.print(ssid);

  WiFi.begin(ssid.c_str(), pass.c_str());
  connectStart = millis();
  uiState = UI_WIFI_CONNECTING;
}

void drawFailedScreen() {
  tft.fillScreen(THEME_BLUE);
  drawHeader("Connection failed");
  tft.setTextSize(2);
  tft.setTextColor(THEME_DANGER, THEME_BLUE);
  tft.setCursor(10, 50);
  tft.println("Wrong password or");
  tft.println("network unreachable");

  int btnY = tft.height() - 40;
  drawButton(20, btnY, tft.width() - 40, 30, THEME_BLUE_DARK, THEME_WHITE, THEME_BLUE_DARK, "TRY AGAIN");
}

void handleFailedTouch(uint16_t tx, uint16_t ty) {
  int btnY = tft.height() - 40;
  if (ty >= btnY && ty < btnY + 30) {
    scanWifiNetworks();
    drawNetworkList();
  }
}

// ── Running screen: shows live status, has a WiFi settings button ─────────
#define WIFI_BTN_W 55
#define WIFI_BTN_H 26

void drawRunningScreen() {
  tft.fillScreen(THEME_BLUE);
  drawHeader("Running"); // shortened to fit portrait width alongside the WiFi button

  drawButton(tft.width() - WIFI_BTN_W - 4, 4, WIFI_BTN_W, WIFI_BTN_H, THEME_WHITE, THEME_BLUE_DARK, THEME_WHITE, "WiFi", 1);

  tft.setTextSize(2);
  tft.setTextColor(THEME_WHITE, THEME_BLUE);
  tft.setCursor(10, 44);
  tft.println(WiFi.SSID());
  tft.setCursor(10, 69);
  tft.println(WiFi.localIP().toString());

  tft.setCursor(10, 99);
  if (hasInternet) { tft.setTextColor(THEME_SUCCESS, THEME_BLUE); tft.println("Internet: OK"); }
  else { tft.setTextColor(THEME_DANGER, THEME_BLUE); tft.println("Internet: NONE"); }

  drawRunningStatus();
}

// Redraws only the status lines that change often (backend + device state)
void drawRunningStatus() {
  tft.fillRect(0, 124, tft.width(), 50, THEME_BLUE);
  tft.setTextSize(2);
  tft.setCursor(10, 129);
  if (backendConnected) { tft.setTextColor(THEME_SUCCESS, THEME_BLUE); tft.println("Backend: OK"); }
  else { tft.setTextColor(THEME_DANGER, THEME_BLUE); tft.println("Backend: --"); }

  tft.setCursor(10, 154);
  tft.setTextColor(THEME_WHITE, THEME_BLUE);
  switch (currentState) {
    case SPINNING:            tft.print("State: SPINNING"); break;
    case SCANNING:             tft.print("State: SCANNING"); break;
    case WAITING_FOR_APP:      tft.print("State: WAIT APP"); break;
    case WAIT_FOR_GAP:         tft.print("State: WAIT GAP"); break;
    case WAIT_FOR_NEXT_PAPER:  tft.print("State: WAIT PAPER"); break;
    case ERROR_PAUSED:         tft.print("State: PAUSED"); break;
  }
}

void handleRunningTouch(uint16_t tx, uint16_t ty) {
  if (tx >= tft.width() - WIFI_BTN_W - 4 && ty <= WIFI_BTN_H + 4) {
    // Stop the sorter and go back to WiFi setup
    motorStop();
    webSocket.disconnect();
    backendConnected = false;
    backendStarted = false;
    WiFi.disconnect(true);
    delay(200);
    scanWifiNetworks();
    drawNetworkList();
  }
}

// ================= setup / loop =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(IR_PIN, INPUT);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUZZER_GND_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(BUZZER_GND_PIN, LOW);

  tft.init();
  tft.setRotation(2); // portrait

  // Work out how many WiFi list rows actually fit this screen's height
  // instead of assuming a fixed landscape count.
  int availListH = tft.height() - LIST_TOP - 40; // reserve room for the nav bar
  rowsPerPage = availListH / ROW_HEIGHT;
  if (rowsPerPage < 1) rowsPerPage = 1;

  drawSplashScreen();
  runCalibration();
  scanWifiNetworks();
  drawNetworkList();
}

void loop() {
  uint16_t tx, ty;
  bool touched = tft.getTouch(&tx, &ty);

  switch (uiState) {
    case UI_WIFI_LIST:
      if (touched) { handleListTouch(tx, ty); delay(200); }
      break;

    case UI_WIFI_KEYBOARD:
      if (touched) { handleKeyboardTouch(tx, ty); delay(200); }
      break;

    case UI_WIFI_CONNECTING:
      if (WiFi.status() == WL_CONNECTED) {
        hasInternet = checkInternet();
        drawRunningScreen();
        startBackend();
        motorForward();
        Serial.println("WiFi connected. Motor running. Ready.");
        uiState = UI_RUNNING;
      } else if (millis() - connectStart > 15000) {
        uiState = UI_WIFI_FAILED;
        drawFailedScreen();
      }
      break;

    case UI_WIFI_FAILED:
      if (touched) { handleFailedTouch(tx, ty); delay(200); }
      break;

    case UI_RUNNING:
      runDeviceLogic();                       // your original sorter loop, untouched logic
      if (touched) { handleRunningTouch(tx, ty); delay(200); }
      if (millis() - lastStatusRefresh > 1000) {
        drawRunningStatus();
        lastStatusRefresh = millis();
      }
      break;

    default:
      break;
  }
}
