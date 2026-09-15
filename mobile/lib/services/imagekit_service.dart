import 'dart:convert';
import 'package:camera/camera.dart';
import 'package:dio/dio.dart';
import '../config/app_config.dart';

class ImageKitService {
  // Without these a stalled upload never returns: the request hangs, the belt
  // stays braked holding the sheet, and the operator has nothing to act on. A
  // timeout instead surfaces as a normal failure the scan screen can recover
  // from. sendTimeout is generous because this is image bytes over a hotspot.
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 15),
    sendTimeout: const Duration(seconds: 60),
    receiveTimeout: const Duration(seconds: 30),
  ));

  /// Uploads [imageFile] to ImageKit and returns the public URL.
  ///
  /// Uses HTTP Basic Auth with the private key as the username (ImageKit's
  /// server-side upload authentication method).
  Future<String> uploadImage(XFile imageFile, String fileName) async {
    final bytes = await imageFile.readAsBytes();
    final basicAuth =
        'Basic ${base64Encode(utf8.encode('${AppConfig.imagekitPrivateKey}:'))}';

    final response = await _dio.post(
      AppConfig.imagekitUploadUrl,
      data: FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: fileName),
        'fileName': fileName,
        'useUniqueFileName': 'true',
        'folder': '/sheets',
      }),
      options: Options(headers: {'Authorization': basicAuth}),
    );

    final data = response.data as Map<String, dynamic>;
    return data['url'] as String;
  }
}
