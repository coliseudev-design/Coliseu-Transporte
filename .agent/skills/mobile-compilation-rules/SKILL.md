# 📱 Application Compilation Protocol

> **MANDATORY:** Rule applied for generating mobile application versions.

## Code Naming Rules
1. **Naming:** All valid deployment Android APKs must be renamed to `autocentermobile` followed by their version.
2. **Versioning:** File outputs must include Semantic Versioning (SemVer) and Build Numbers (e.g., `autocentermobile_v1.0.0_b1.apk`).
3. **Execution Script:** Recompilations must be done by calling `.agent/scripts/compile_mobile.ps1`.
   - Use flag `-bumpVersion` to automatically increment the build number inside `pubspec.yaml`.
4. **Output Logging:** Upon completion, the console must print the absolute path of the generated APK.

## Compilation Usage
```powershell
# Bump the version in pubspec and compile the app according to strict rules:
powershell -ExecutionPolicy Bypass -File .agent/scripts/compile_mobile.ps1 -bumpVersion
```
