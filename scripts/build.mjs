import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const distDir = 'dist';

async function build() {
  console.log('📦 Generating CommonJS build...');

  const tempCjsDir = 'dist-temp-cjs';
  if (fs.existsSync(tempCjsDir)) {
    fs.rmSync(tempCjsDir, { recursive: true, force: true });
  }

  try {
    // Generate CJS files and declarations
    execSync(`npx tsc --project tsconfig.build.json --module CommonJS --moduleResolution Node --outDir ${tempCjsDir} --declaration true --sourceMap false`, { stdio: 'inherit' });

    const files = fs.readdirSync(tempCjsDir);
    
    for (const file of files) {
      const srcPath = path.join(tempCjsDir, file);
      if (fs.statSync(srcPath).isDirectory()) continue;

      if (file.endsWith('.js')) {
        let content = fs.readFileSync(srcPath, 'utf8');
        
        // Update internal requires from .js to .cjs
        content = content.replace(/require\("(\.\.?\/.*)\.js"\)/g, 'require("$1.cjs")');
        
        const destPath = path.join(distDir, file.replace(/\.js$/, '.cjs'));
        fs.writeFileSync(destPath, content);
      } else if (file.endsWith('.d.ts')) {
        let content = fs.readFileSync(srcPath, 'utf8');
        
        // Update internal declaration references
        content = content.replace(/from '(\.\.?\/.*)\.js'/g, "from '$1.cjs'");
        content = content.replace(/import\("(\.\.?\/.*)\.js"\)/g, 'import("$1.cjs")');
        
        const destPath = path.join(distDir, file.replace(/\.d\.ts$/, '.d.cts'));
        fs.writeFileSync(destPath, content);
      }
    }

    console.log('✅ CommonJS build complete.');
  } catch (error) {
    console.error('❌ CommonJS build failed:', error.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempCjsDir)) {
      fs.rmSync(tempCjsDir, { recursive: true, force: true });
    }
  }
}

build();
