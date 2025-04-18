import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VectorChunk } from '../entities/vector-chunk.entity';

export interface VectorSearchResult {
  id: string;
  documentId: string;
  botId: number;
  filename: string;
  text: string;
  score: number;
  metadata?: any;
}

@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(
    @InjectRepository(VectorChunk)
    private vectorChunkRepository: Repository<VectorChunk>,
  ) {}

  /**
   * Lưu một chunk văn bản và vector embedding tương ứng vào database
   */
  async saveChunk(params: {
    botId: number;
    documentId: string;
    text: string;
    embedding: number[];
    metadata?: Record<string, any>;
  }): Promise<VectorChunk> {
    try {
      const { botId, documentId, text, embedding, metadata } = params;

      // Tạo entity mới
      const vectorChunk = new VectorChunk();
      vectorChunk.botId = botId;
      vectorChunk.documentId = documentId;
      vectorChunk.text = text;
      vectorChunk.embedding = embedding;
      vectorChunk.metadata = metadata || {};

      // Lưu vào database
      const savedChunk = await this.vectorChunkRepository.save(vectorChunk);
      this.logger.log(`Đã lưu chunk id=${savedChunk.id} cho document ${documentId}`);

      return savedChunk;
    } catch (error) {
      this.logger.error(`Lỗi khi lưu chunk: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tìm kiếm các chunks tương tự với vector embedding đầu vào
   */
  async searchSimilarChunks(
    embedding: number[],
    botId: number,
    limit: number = 5,
    similarityThreshold: number = 0.7,
  ): Promise<
    Array<{
      id: string; // Thay đổi kiểu từ number sang string để khớp với định nghĩa entity
      text: string;
      similarity: number;
      metadata?: Record<string, any>;
    }>
  > {
    try {
      this.logger.log(`Tìm kiếm ${limit} chunks tương tự nhất cho botId=${botId}`);

      // Sử dụng pgvector để tìm kiếm tương tự
      // Cosine distance = 1 - cosine similarity
      const results = await this.vectorChunkRepository
        .createQueryBuilder('chunk')
        .select([
          'chunk.id',
          'chunk.text',
          'chunk.metadata',
          `1 - (chunk.embedding::vector <=> :embedding) AS similarity`,
        ])
        .where('chunk.botId = :botId', { botId })
        .andWhere('1 - (chunk.embedding::vector <=> :embedding) > :threshold', {
          embedding, // đây là mảng float (double precision[])
          threshold: similarityThreshold,
        })
        .orderBy('similarity', 'DESC')
        .limit(limit)
        .getRawMany();

      return results.map((result) => ({
        id: result.chunk_id,
        text: result.chunk_text,
        metadata: result.chunk_metadata,
        similarity: parseFloat(result.similarity),
      }));
    } catch (error) {
      this.logger.error(`Lỗi khi tìm kiếm chunks tương tự: ${error.message}`);

      // Nếu lỗi liên quan đến pgvector, cung cấp thông tin hữu ích
      if (error.message.includes('<=>')) {
        this.logger.error('Có vẻ như pgvector extension chưa được cài đặt trong PostgreSQL');

        // Sử dụng fallback với JavaScript implementation khi pgvector không hoạt động
        this.logger.warn('Đang sử dụng fallback với JavaScript implementation');

        // Lấy tất cả chunks và tính toán similarity trong ứng dụng
        const chunks = await this.vectorChunkRepository.find({
          where: { botId },
        });

        const results = chunks
          .map((chunk) => {
            const similarity = this.cosineSimilarity(embedding, chunk.embedding);
            return {
              id: chunk.id, // id đã là string, khớp với định nghĩa entity
              text: chunk.text,
              metadata: chunk.metadata,
              similarity,
            };
          })
          .filter((result) => result.similarity > similarityThreshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        return results;
      }

      throw error;
    }
  }

  /**
   * Xóa tất cả chunks thuộc về một document
   */
  async deleteChunksByDocumentId(documentId: string): Promise<void> {
    try {
      await this.vectorChunkRepository.delete({ documentId });
      this.logger.log(`Đã xóa tất cả chunks thuộc document ${documentId}`);
    } catch (error) {
      this.logger.error(`Lỗi khi xóa chunks theo documentId: ${error.message}`);
      throw error;
    }
  }

  async saveBatchChunks(
    chunks: Omit<VectorChunk, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<VectorChunk[]> {
    try {
      this.logger.log(`Saving batch of ${chunks.length} chunks`);

      const vectorChunks = this.vectorChunkRepository.create(chunks);
      return await this.vectorChunkRepository.save(vectorChunks);
    } catch (error) {
      this.logger.error(`Error saving batch vector chunks: ${error.message}`);
      throw error;
    }
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    try {
      this.logger.log(`Deleting chunks for document: ${documentId}`);

      await this.vectorChunkRepository.delete({ documentId });
    } catch (error) {
      this.logger.error(`Error deleting vector chunks: ${error.message}`);
      throw error;
    }
  }

  async similaritySearch(
    botId: number,
    queryEmbedding: number[],
    k: number = 5,
  ): Promise<VectorSearchResult[]> {
    try {
      this.logger.log(`Performing similarity search for botId: ${botId}, k: ${k}`);

      // PostgreSQL with pgvector extension query (example)
      // Thực tế sẽ cần cài đặt pgvector extension và sử dụng các hàm vector_cosine_distance
      // Trong ví dụ này, tôi sẽ sử dụng native TypeORM features để mô phỏng

      // Lấy tất cả chunks cho bot này
      const chunks = await this.vectorChunkRepository.find({
        where: { botId },
      });

      // Tính toán similarity score (cosine similarity)
      const results = chunks.map((chunk) => {
        const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);

        return {
          id: chunk.id,
          documentId: chunk.documentId,
          botId: chunk.botId,
          filename: chunk.filename,
          text: chunk.text,
          score,
          metadata: chunk.metadata
            ? typeof chunk.metadata === 'string'
              ? JSON.parse(chunk.metadata)
              : chunk.metadata
            : undefined,
        };
      });

      // Sắp xếp theo score giảm dần và chỉ lấy k kết quả đầu tiên
      return results.sort((a, b) => b.score - a.score).slice(0, k);
    } catch (error) {
      this.logger.error(`Error performing similarity search: ${error.message}`);
      throw error;
    }
  }

  async search(
    botId: number,
    query: string,
    queryEmbedding: number[],
    k: number = 5,
  ): Promise<VectorSearchResult[]> {
    try {
      this.logger.log(`Performing search for botId: ${botId}, query: ${query}, k: ${k}`);

      // Hybrid search kết hợp vector search với keyword search
      // Tương tự như sử dụng combined score giữa vector similarity và keyword matching

      // Trong ví dụ này, chỉ làm similarity search đơn giản
      return this.similaritySearch(botId, queryEmbedding, k);
    } catch (error) {
      this.logger.error(`Error performing search: ${error.message}`);
      throw error;
    }
  }

  // Helper methods

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }
}
