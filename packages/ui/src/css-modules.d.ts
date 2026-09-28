// CSS Modules, as Next.js compiles them: each class name maps to its scoped
// name. Declared here so the package typechecks on its own.
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
