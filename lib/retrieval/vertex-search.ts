import type { Citation } from "@/lib/schemas";

export interface GroundedSearchResult {
  sourceIds: string[];
  citations: Citation[];
  confidence?: number;
}

export interface RetrievalClient {
  search(question: string, spaceId?: string): Promise<GroundedSearchResult>;
}

export class NotConfiguredRetrievalClient implements RetrievalClient {
  async search(): Promise<GroundedSearchResult> {
    return {
      sourceIds: [],
      citations: [],
      confidence: 0,
    };
  }
}
