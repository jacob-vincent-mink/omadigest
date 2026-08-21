// OmaDigest does not register legacy global API providers or arbitrary model
// overlays. The scoped ModelRuntime still uses each provider's native stream.
export function getApiProvider(): undefined {
  return undefined;
}
