import { Body, Controller, Post, Delete, Param, Logger, Get, Query } from '@nestjs/common';
import { VectorStoreService, VectorSearchResult } from './vector-store.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { VectorChunk } from '../entities/vector-chunk.entity';

interface SaveChunkDto {
  documentId: string;
  botId: number;
  filename: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

interface SearchDto {
  botId: number;
  query: string;
  queryEmbedding: number[];
  k?: number;
}

@Controller('vector-store')
export class VectorStoreController {
  private readonly logger = new Logger(VectorStoreController.name);

  constructor(
    private readonly vectorStoreService: VectorStoreService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  @Post('/chunk')
  async saveChunk(
    @Body()
    chunkData: {
      documentId: string;
      botId: number;
      filename: string;
      text: string;
      embedding: number[];
      metadata?: Record<string, any>;
    },
  ) {
    this.logger.log(`Nhận request lưu chunk cho document: ${chunkData.documentId}`);

    // Lưu chunk với embedding đã tạo sẵn
    return this.vectorStoreService.saveChunk({
      documentId: chunkData.documentId,
      botId: chunkData.botId,
      text: chunkData.text,
      embedding: chunkData.embedding,
      metadata: {
        filename: chunkData.filename,
        ...(chunkData.metadata || {}),
      },
    });
  }

  @Post('/chunk/generate')
  async generateAndSaveChunk(
    @Body()
    data: {
      documentId: string;
      botId: number;
      filename: string;
      text: string;
      metadata?: Record<string, any>;
    },
  ) {
    this.logger.log(`Nhận request tạo embedding và lưu chunk cho document: ${data.documentId}`);

    // Tạo embedding cho text
    const embedding = await this.embeddingService.createEmbedding(data.text);

    // Lưu chunk với embedding vừa tạo
    return this.vectorStoreService.saveChunk({
      documentId: data.documentId,
      botId: data.botId,
      text: data.text,
      embedding: embedding,
      metadata: {
        filename: data.filename,
        ...(data.metadata || {}),
      },
    });
  }

  @Delete('/document/:documentId')
  async deleteChunksByDocumentId(@Param('documentId') documentId: string) {
    this.logger.log(`Nhận request xóa tất cả chunks của document: ${documentId}`);
    await this.vectorStoreService.deleteChunksByDocumentId(documentId);
    return { success: true, message: `Đã xóa tất cả chunks của document ${documentId}` };
  }

  @Post('/chunks')
  async saveBatchChunks(@Body() chunksDto: SaveChunkDto[]): Promise<VectorChunk[]> {
    // Ensure metadata is provided for all chunks
    const chunksWithMetadata = chunksDto.map((chunk) => ({
      ...chunk,
      metadata: chunk.metadata || null,
    }));
    return this.vectorStoreService.saveBatchChunks(chunksWithMetadata);
  }

  @Post('/search')
  async search(@Body() searchDto: SearchDto): Promise<VectorSearchResult[]> {
    const { botId, query, queryEmbedding, k = 5 } = searchDto;
    return this.vectorStoreService.search(botId, query, queryEmbedding, k);
  }

  @Post('/similarity-search')
  async similaritySearch(
    @Body() searchDto: { botId: number; queryEmbedding: number[]; k?: number },
  ): Promise<VectorSearchResult[]> {
    const { botId, queryEmbedding, k = 5 } = searchDto;
    return this.vectorStoreService.similaritySearch(botId, queryEmbedding, k);
  }

  @Get('/document/:documentId/chunks-count')
  async getDocumentChunksCount(
    @Param('documentId') documentId: string,
    @Query('botId') botId: number,
  ) {
    this.logger.log(`Nhận request đếm số chunks của document: ${documentId}, botId: ${botId}`);
    const count = await this.vectorStoreService.countChunksByDocumentId(documentId, botId);
    return { count, documentId, botId };
  }
}
