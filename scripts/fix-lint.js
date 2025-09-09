#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Run ESLint with --fix to auto-fix what we can
console.log('Running ESLint with --fix to auto-fix formatting issues...');
try {
  execSync('npx eslint src --ext .ts --fix', { stdio: 'inherit' });
} catch (e) {
  console.log('ESLint --fix completed with some remaining issues');
}

// Get remaining errors
console.log('\nCollecting remaining errors...');
const output = execSync('npx eslint src --ext .ts --format json', { encoding: 'utf-8' });
const results = JSON.parse(output);

let totalFixed = 0;
const fixes = {
  unusedVars: 0,
  caseDeclarations: 0,
  unusedImports: 0
};

for (const file of results) {
  if (file.errorCount === 0 && file.warningCount === 0) continue;
  
  let content = fs.readFileSync(file.filePath, 'utf-8');
  let modified = false;
  
  for (const message of file.messages) {
    if (message.ruleId === '@typescript-eslint/no-unused-vars') {
      // Fix unused variables by prefixing with underscore
      const line = content.split('\n')[message.line - 1];
      const match = line.match(/\b(const|let|var)\s+(\w+)\s*=/);
      if (match && match[2] && !match[2].startsWith('_')) {
        const newLine = line.replace(
          new RegExp(`\\b${match[1]}\\s+${match[2]}\\b`),
          `${match[1]} _${match[2]}`
        );
        const lines = content.split('\n');
        lines[message.line - 1] = newLine;
        content = lines.join('\n');
        modified = true;
        fixes.unusedVars++;
      }
      
      // Fix unused imports by removing them
      if (line.includes('import') && message.message.includes('is defined but never used')) {
        const importMatch = line.match(/import\s+{([^}]+)}\s+from/);
        if (importMatch) {
          const imports = importMatch[1].split(',').map(i => i.trim());
          const unusedVar = message.message.match(/'(\w+)'/)?.[1];
          if (unusedVar) {
            const newImports = imports.filter(i => !i.includes(unusedVar));
            if (newImports.length === 0) {
              // Remove entire import line
              const lines = content.split('\n');
              lines.splice(message.line - 1, 1);
              content = lines.join('\n');
            } else {
              // Update import list
              const newLine = line.replace(
                /import\s+{[^}]+}/,
                `import { ${newImports.join(', ')} }`
              );
              const lines = content.split('\n');
              lines[message.line - 1] = newLine;
              content = lines.join('\n');
            }
            modified = true;
            fixes.unusedImports++;
          }
        }
      }
    }
    
    if (message.ruleId === 'no-case-declarations') {
      // Fix case declarations by adding block scope
      const lines = content.split('\n');
      const line = lines[message.line - 1];
      
      // Find the case statement
      let caseLineIndex = message.line - 1;
      while (caseLineIndex >= 0 && !lines[caseLineIndex].trim().startsWith('case ')) {
        caseLineIndex--;
      }
      
      if (caseLineIndex >= 0) {
        // Find the next case or default
        let nextCaseIndex = message.line;
        while (nextCaseIndex < lines.length) {
          const trimmed = lines[nextCaseIndex].trim();
          if (trimmed.startsWith('case ') || trimmed.startsWith('default:') || trimmed === '}') {
            break;
          }
          nextCaseIndex++;
        }
        
        // Add braces around the case content
        lines[caseLineIndex] = lines[caseLineIndex] + ' {';
        lines.splice(nextCaseIndex, 0, '      }');
        content = lines.join('\n');
        modified = true;
        fixes.caseDeclarations++;
      }
    }
  }
  
  if (modified) {
    fs.writeFileSync(file.filePath, content);
    totalFixed++;
    console.log(`Fixed issues in: ${path.relative(process.cwd(), file.filePath)}`);
  }
}

console.log(`\nFixed ${totalFixed} files:`);
console.log(`  - Unused variables prefixed with _: ${fixes.unusedVars}`);
console.log(`  - Case declarations wrapped in blocks: ${fixes.caseDeclarations}`);
console.log(`  - Unused imports removed: ${fixes.unusedImports}`);

// Run ESLint again to see remaining issues
console.log('\nRunning ESLint again to check remaining issues...');
try {
  execSync('npx eslint src --ext .ts --max-warnings 0', { stdio: 'inherit' });
  console.log('All ESLint issues fixed!');
} catch (e) {
  console.log('\nSome ESLint issues remain. Run "npm run lint" to see them.');
}
