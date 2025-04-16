import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly huggingfaceEndpoint: string;
  private readonly huggingfaceToken: string;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    this.huggingfaceEndpoint = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
    this.huggingfaceToken = this.configService.get<string>('HUGGING_FACE_TOKEN') || '';
    this.modelName =
      this.configService.get<string>('EMBEDDING_MODEL') || 'sentence-transformers/all-MiniLM-L6-v2';
  }

  /**
   * Tạo embedding vector cho một đoạn văn bản
   */
  async createEmbedding(text: string): Promise<number[]> {
    this.logger.debug(`Tạo embedding cho văn bản: "${text.substring(0, 50)}..."`);

    try {
      return this.createEmbeddingWithHuggingFace(text);
    } catch (error) {
      this.logger.error(`Lỗi khi tạo embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tạo embeddings cho một batch các đoạn văn bản
   */
  async createEmbeddingBatch(
    texts: string[],
  ): Promise<Array<{ text: string; embedding: number[] }>> {
    this.logger.log(`Tạo embeddings cho batch ${texts.length} văn bản`);

    try {
      const results = [];

      // Xử lý từng văn bản một
      for (const text of texts) {
        const embedding = await this.createEmbedding(text);
        results.push({ text, embedding });
      }

      return results;
    } catch (error) {
      this.logger.error(`Lỗi khi tạo embedding batch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tạo embedding sử dụng Hugging Face API
   */
  private async createEmbeddingWithHuggingFace(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        `${this.huggingfaceEndpoint}/${this.modelName}`,
        { inputs: text },
        {
          headers: {
            Authorization: `Bearer ${this.huggingfaceToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // Kiểm tra định dạng response
      if (Array.isArray(response.data) && response.data.length > 0) {
        if (Array.isArray(response.data[0])) {
          // Trường hợp output là mảng 2D [[...]]
          return response.data[0];
        } else {
          // Trường hợp output là mảng 1D [...]
          return response.data;
        }
      } else {
        throw new Error('Invalid response format from Hugging Face API');
      }
    } catch (error) {
      this.logger.error(`Lỗi khi tạo embedding với Hugging Face API: ${error.message}`);
      throw error;
    }
  }
}
