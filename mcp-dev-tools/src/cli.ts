// mcp-dev-tools/src/cli.ts
import { readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process'; // Moved to top level
import { SpecParser } from './parsers/spec-parser.js';
import { TestResultParser } from './test-result-parser.js';
import { TestReporter } from '../../mcp-debugger/src/test-reporter.js'; // Corrected path
import { Deployer } from './deployer.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'parse-spec': {
      const specPath = args[1];
      if (!specPath) {
        console.error("Usage: cli parse-spec <path_to_spec_document>");
        process.exit(1);
      }
      try {
        const fullSpecPath = path.resolve(process.cwd(), specPath);
        const specContent = readFileSync(fullSpecPath, 'utf-8');
        const parser = new SpecParser();
        const parsed = parser.parse(specContent);
        console.log(JSON.stringify(parsed, null, 2));
      } catch (error) {
        console.error("Error parsing spec:", error);
      }
      break;
    }
    case 'run-tests': {
      const projectPath = args[1];
      if (!projectPath) {
        console.error("Usage: cli run-tests <path_to_project>");
        process.exit(1);
      }
      const fullProjectPath = path.resolve(process.cwd(), projectPath);
      try {
        console.log(`Running tests for project: ${projectPath}...`);
        const testOutput = execSync(`npm test`, { cwd: fullProjectPath, encoding: 'utf-8', stdio: 'pipe' });
        const parser = new TestResultParser();
        const results = parser.parse(testOutput);
        const reporter = new TestReporter();
        const projectName = path.basename(fullProjectPath);
        reporter.report(projectName, results);
      } catch (error: any) {
        const fullOutput = (error.stdout ? error.stdout.toString() : '') + (error.stderr ? error.stderr.toString() : '');
        console.error("Test command full output (on error):", fullOutput);
        const parser = new TestResultParser();
        const results = parser.parse(fullOutput || '');
        const reporter = new TestReporter();
        const projectName = path.basename(fullProjectPath);
        reporter.report(projectName, results);
        // Do not exit here, let the reporter handle it.
      }
      break;
    }
    case 'deploy': {
      const projectName = args[1];
      const projectPath = args[2];
      if (!projectName || !projectPath) {
        console.error("Usage: cli deploy <project_name> <path_to_project>");
        process.exit(1);
      }
      const fullProjectPath = path.resolve(process.cwd(), projectPath);
      const deployer = new Deployer();
      const success = deployer.deploy(projectName, fullProjectPath);
      console.log(`Deployment for ${projectName} ${success ? 'succeeded' : 'failed'}.`);
      break;
    }
    default: {
      console.log("Usage: cli <command> [args]");
      console.log("Commands:");
      console.log("  parse-spec <path_to_spec_document>");
      console.log("  run-tests <path_to_project>");
      console.log("  deploy <project_name> <path_to_project>");
      break;
    }
  }
}

main();


