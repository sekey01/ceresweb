import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../models/sheet.dart';

class OcrService {
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 120),
  ));

  /// Submits [imageUrl] to Datalab for conversion and polls until complete.
  /// Returns HTML output to preserve document structure.
  /// Returns null if OCR fails (operator can still upload the sheet).
  Future<OcrResult?> extractOcr(String imageUrl) async {
    try {
      // Step 1 — Submit document for conversion
      final submitRes = await _dio.post(
        AppConfig.chandraOcrUrl,
        data: FormData.fromMap({
          'file_url': imageUrl,
          'output_format': 'html',
          'mode': 'balanced',
        }),
        options: Options(headers: {'X-API-Key': AppConfig.chandraOcrApiKey}),
      );

      final submitData = submitRes.data as Map<String, dynamic>;
      if (submitData['success'] != true) return null;

      final checkUrl = submitData['request_check_url'] as String?;
      if (checkUrl == null) return null;

      // Step 2 — Poll until complete, checking soon after submitting and then
      // backing off. A fixed 2 s interval meant even an instant conversion
      // couldn't be observed for 2 s, so every single scan paid that wait; the
      // back-off settles at the same 2 s rate for jobs that really are slow.
      final deadline = DateTime.now().add(const Duration(seconds: 120));
      var wait = const Duration(milliseconds: 400);

      while (DateTime.now().isBefore(deadline)) {
        await Future.delayed(wait);

        final pollRes = await _dio.get(
          checkUrl,
          options: Options(headers: {'X-API-Key': AppConfig.chandraOcrApiKey}),
        );
        final result = pollRes.data as Map<String, dynamic>;

        if (result['status'] == 'failed') return null;

        if (result['status'] == 'complete' && result['success'] == true) {
          final html = result['html'] as String? ?? '';
          final meta = result['metadata'] as Map<String, dynamic>? ?? {};
          return OcrResult(text: html, metadata: meta);
        }

        final next = (wait.inMilliseconds * 1.5).round();
        wait = Duration(milliseconds: next > 2000 ? 2000 : next);
      }
      return null; // timed out
    } catch (_) {
      // OCR failure is non-fatal — return null so the sheet can still upload
      return null;
    }
  }
}
