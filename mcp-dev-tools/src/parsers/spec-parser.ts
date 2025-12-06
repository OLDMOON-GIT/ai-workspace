// mcp-dev-tools/src/parsers/spec-parser.ts

export class SpecParser {
  /**
   * Parses a given specification document (e.g., Markdown, plain text)
   * and extracts actionable development items or features.
   * @param document The content of the specification document.
   * @returns A structured representation of the extracted specifications.
   */
  parse(document: string): any {
    const lines = document.split('\n');
    const parsedDocument: any = {
      title: "Parsed Specification Document",
      features: []
    };
    let currentFeature: any = null;
    let currentUserStory: any = null;
    let currentAcceptanceCriteria: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('# Feature:')) {
        if (currentUserStory) {
          currentUserStory.acceptanceCriteria = [...currentAcceptanceCriteria];
          currentFeature.userStories.push(currentUserStory);
        }
        if (currentFeature) {
          parsedDocument.features.push(currentFeature);
        }
        currentFeature = {
          title: line.replace('# Feature:', '').trim(),
          userStories: []
        };
        currentUserStory = null;
        currentAcceptanceCriteria = [];
      } else if (line.startsWith('## As a')) {
        if (currentUserStory) {
          currentUserStory.acceptanceCriteria = [...currentAcceptanceCriteria];
          currentFeature.userStories.push(currentUserStory);
        }
        const match = line.match(/## As (?:a|an) (.+), I want to (.+)/);
        if (match) {
          currentUserStory = {
            role: match[1].trim(),
            story: match[2].trim(),
            acceptanceCriteria: []
          };
        } else {
          // Handle cases where the format "## As a ..., I want to ..." is not strictly followed
          currentUserStory = {
            role: "unknown",
            story: line.replace('## As a', '').trim(),
            acceptanceCriteria: []
          };
        }
        currentAcceptanceCriteria = [];
      } else if (line.startsWith('- Given') || line.startsWith('- When') || line.startsWith('- Then')) {
        if (currentUserStory) {
          currentAcceptanceCriteria.push(line.trim());
        }
      }
    }

    // After the loop, push the last user story and feature if they exist
    if (currentUserStory) {
      currentUserStory.acceptanceCriteria = [...currentAcceptanceCriteria];
      currentFeature.userStories.push(currentUserStory);
    }
    if (currentFeature) {
      parsedDocument.features.push(currentFeature);
    }

    return parsedDocument;
  }
}
