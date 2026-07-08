// Vendored from langchain-ai/openwiki @ 23428de0cc0b1b6d3e5d09be413e92a5d6ee451f
// Source: src/agent/types.ts (https://github.com/langchain-ai/openwiki/blob/23428de0cc0b1b6d3e5d09be413e92a5d6ee451f/src/agent/types.ts)
// Upstream license: MIT — see vendor/openwiki/LICENSE.
// SPDX-License-Identifier: MIT
// DO NOT EDIT — regenerate via scripts/vendor-openwiki.sh.
export type OpenWikiCommand = "chat" | "init" | "update";

export type OpenWikiRunResult = {
  command: OpenWikiCommand;
  model: string;
  skipped?: boolean;
};

export type OpenWikiRunEvent =
  | {
      source?: "main" | "subgraph";
      type: "text";
      text: string;
    }
  | {
      type: "tool_start";
      call: string;
      id: string;
      input: unknown;
      name: string;
    }
  | {
      type: "tool_end";
      id: string;
      name: string;
      status: "error" | "finished";
    }
  | {
      type: "debug";
      message: string;
    };

export type OpenWikiRunOptions = {
  debug?: boolean;
  isFollowup?: boolean;
  modelId?: string | null;
  onEvent?: (event: OpenWikiRunEvent) => void;
  threadId?: string;
  userMessage?: string | null;
};

export type UpdateMetadata = {
  updatedAt: string;
  command: OpenWikiCommand;
  gitHead?: string;
  model: string;
};

export type RunContext = {
  lastUpdate: UpdateMetadata | null;
  gitSummary: string;
};
