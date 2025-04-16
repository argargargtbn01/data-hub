import { Injectable, Logger } from '@nestjs/common';
import { VectorStoreService, VectorSearchResult } from '../vector-store/vector-store.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly huggingfaceUrl: string;
  private readonly huggingfaceToken: string;
  private readonly embeddingModel: string;

  constructor(
    private vectorStoreService: VectorStoreService,
    private configService: ConfigService,
  ) {
    this.huggingfaceUrl = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
    this.huggingfaceToken = this.configService.get<string>('HUGGING_FACE_TOKEN');
    this.embeddingModel = this.configService.get<string>('EMBEDDING_MODEL') || 'sentence-transformers/all-MiniLM-L6-v2';
  }

  async retrieveRelevantDocuments(
    botId: number,
    query: string,
    k: number = 5,
  ): Promise<VectorSearchResult[]> {
    try {
      this.logger.log(`Retrieving relevant documents for botId: ${botId}, query: ${query}`);
      
      // Tạo embedding cho query
      const queryEmbedding = await this.createEmbedding(query);
      
      // Tìm kiếm các tài liệu có liên quan
      return this.vectorStoreService.search(botId, query, queryEmbedding, k);
    } catch (error) {
      this.logger.error(`Error retrieving relevant documents: ${error.message}`);
      throw error;
    }
  }

  async prepareContext(
    botId: number,
    query: string,
    k: number = 5,
  ): Promise<string> {
    try {
      // Lấy các tài liệu liên quan dựa trên câu hỏi
      const relevantDocuments = await this.retrieveRelevantDocuments(botId, query, k);
      
      if (!relevantDocuments || relevantDocuments.length === 0) {
        this.logger.warn(`No relevant documents found for botId: ${botId}, query: ${query}`);
        return '';
      }
      
      // Xây dựng ngữ cảnh từ các tài liệu tìm được
      // Thêm metadata để giúp LLM hiểu nguồn thông tin
      const contextParts = relevantDocuments.map((doc, index) => {
        return `[Document ${index + 1} from ${doc.filename}]: ${doc.text}`;
      });
      
      // Ghép tất cả các phần ngữ cảnh lại với nhau
      return contextParts.join('\n\n');
    } catch (error) {
      this.logger.error(`Error preparing context: ${error.message}`);
      throw error;
    }
  }

  private async createEmbedding(text: string): Promise<number[]> {
    try {
      this.logger.log(`Creating embedding for text of length ${text.length} using model ${this.embeddingModel}`);
      
      const response = await axios.post(
        `${this.huggingfaceUrl}/${this.embeddingModel}`,
        { inputs: text },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.huggingfaceToken}`,
          },
        },
      );

      // Hugging Face trả về trực tiếp mảng embedding
      return response.data;
    } catch (error) {
      this.logger.error(`Error creating embedding with Hugging Face: ${error.message}`);
      throw error;
    }
  }
}