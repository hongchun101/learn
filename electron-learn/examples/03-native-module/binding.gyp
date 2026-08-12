// examples/03-native-module/binding.gyp
{
  "targets": [
    {
      "target_name": "sum",
      "sources": [ "sum.cc" ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [ "NAPI_VERSION=8" ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": [ "/std:c++17" ]
        }
      }
    }
  ]
}
