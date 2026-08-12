// examples/03-native-module/sum.cc
// 一个最小 N-API 模块：求数组总和
#include <napi.h>
#include <vector>

Napi::Value Sum(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "expected array").ThrowAsJavaScriptException();
    return env.Null();
  }
  Napi::Array arr = info[0].As<Napi::Array>();
  uint32_t len = arr.Length();
  std::vector<double> values;
  values.reserve(len);
  for (uint32_t i = 0; i < len; i++) {
    Napi::Value v = arr.Get(i);
    if (!v.IsNumber()) {
      Napi::TypeError::New(env, "expected number").ThrowAsJavaScriptException();
      return env.Null();
    }
    values.push_back(v.As<Napi::Number>().DoubleValue());
  }
  double total = 0.0;
  for (double v : values) total += v;
  return Napi::Number::New(env, total);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("sum", Napi::Function::New(env, Sum));
  return exports;
}

NODE_API_MODULE(sum, Init)
