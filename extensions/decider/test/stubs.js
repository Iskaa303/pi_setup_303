// Resolver hook for the extension tests: stand in for the host modules pi
// provides at runtime, and do the "./x.js" -> "./x.ts" mapping that pi's jiti
// loader does (Node's type-stripping loader does not).
//
// Registered from load.test.ts as a plain hooks module — no nested register,
// which deadlocks here.
const STUBS = {
  typebox: `
    const schema = (kind) => (opts = {}) => ({ type: kind, ...opts });
    export const Type = {
      Object: schema("object"), Array: schema("array"), String: schema("string"),
      Number: schema("number"), Boolean: schema("boolean"), Union: (items) => ({ anyOf: items }),
      Literal: (value) => ({ const: value }), Optional: (item) => item,
      Record: (key, value) => ({ type: "record" }), Unsafe: (spec) => spec,
    };
  `,
  "@earendil-works/pi-coding-agent": "export {};",
};

export async function resolve(specifier, context, next) {
  const body = STUBS[specifier];
  if (body) return { url: "data:text/javascript," + encodeURIComponent(body), shortCircuit: true, format: "module" };

  if (specifier.startsWith("./") && specifier.endsWith(".js") && context.parentURL) {
    const target = new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL);
    return next(target.href, context);
  }
  return next(specifier, context);
}
