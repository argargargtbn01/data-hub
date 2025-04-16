import { Body, Controller, Post, Query } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { VectorSearchResult } from '../vector-store/vector-store.service';

interface RetrieveDocumentsDto {
  botId: number;
  query: string;
  k?: number;
}

interface RerankResultsDto {
  query: string;
  results: VectorSearchResult[];
  topK?: number;
}

@Controller('retrieval')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  @Post('/documents')
  async retrieveRelevantDocuments(
    @Body() dto: RetrieveDocumentsDto,
  ): Promise<VectorSearchResult[]> {
    const { botId, query, k = 5 } = dto;
    return this.retrievalService.retrieveRelevantDocuments(botId, query, k);
  }

  @Post('/prepare-context')
  async prepareContext(
    @Body() dto: RetrieveDocumentsDto,
  ): Promise<{ context: string }> {
    const { botId, query, k = 5 } = dto;
    const context = await this.retrievalService.prepareContext(botId, query, k);
    return { context };
  }
}