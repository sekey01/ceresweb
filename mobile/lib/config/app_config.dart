class AppConfig {
  // Backend, hosted on Render — one fixed URL for every phone, no
  // per-device pairing. Update after deploying.
  static const String apiBaseUrl = 'https://ceresweb-1.onrender.com';

  // Hardware relay endpoint on the same backend — the ESP32 connects out
  // to the backend too (it can't be reached directly from the internet),
  // so the backend relays PAPER_DETECTED / SCAN_COMPLETE / etc. between
  // the two. The connected user's access token is appended as ?token=...
  // at connect time (see hardware_service.dart), not baked in here.
  static const String hardwareWsUrl = 'wss://ceresweb-1.onrender.com/ws/app';

  // ImageKit configuration
  static const String imagekitPublicKey = 'public_Kto9TlcMV+9ep5+d65JCb0yq9Ko=';
  static const String imagekitPrivateKey = 'private_EvS4dGJx48Ft3CjWclfAAdT/KgI=';
  static const String imagekitUrlEndpoint = 'https://ik.imagekit.io/x2uo7omcw';
  static const String imagekitUploadUrl = 'https://upload.imagekit.io/api/v1/files/upload';

  // Chandra OCR API
  static const String chandraOcrUrl = 'https://www.datalab.to/api/v1/convert';
  static const String chandraOcrApiKey = 'mSQMwo70NSudf8G-SqyAPtwwf0c_sm3_DniNCYI0wZU';

  // Ceres brand colour
  static const int primaryColor = 0xFF1D4ED8;

  // Secure storage keys
  static const String accessTokenKey = 'ceres_access_token';
  static const String refreshTokenKey = 'ceres_refresh_token';
}
