// Prints the text macOS Vision reads in an image, one line per observation.
// push.sh uses it to read iOS notification banners, which SpringBoard draws
// outside the app's view hierarchy, so Maestro cannot see them.
//
//   swift maestro/scripts/ocr-text.swift screenshot.png
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write("usage: ocr-text.swift <image>\n".data(using: .utf8)!)
  exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
let url = URL(fileURLWithPath: CommandLine.arguments[1])
try VNImageRequestHandler(url: url, options: [:]).perform([request])
for observation in request.results ?? [] {
  if let line = observation.topCandidates(1).first?.string { print(line) }
}
