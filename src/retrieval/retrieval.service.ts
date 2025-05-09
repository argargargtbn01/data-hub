import { Injectable, Logger } from '@nestjs/common';
import { VectorStoreService, VectorSearchResult } from '../vector-store/vector-store.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly googleApiEndpoint: string;
  private readonly googleApiKey: string;

  constructor(
    private vectorStoreService: VectorStoreService,
    private configService: ConfigService,
  ) {
    this.googleApiEndpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent';
    this.googleApiKey =
      this.configService.get<string>('GOOGLE_API_KEY') || '';
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

  async prepareContext(botId: number, query: string, k: number = 5): Promise<string> {
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
      this.logger.log(`Tạo embedding cho văn bản có độ dài ${text.length}`);

      // Validate input text
      if (!text || text.trim() === '') {
        this.logger.error('Văn bản rỗng không thể tạo embedding');
        throw new Error('Văn bản không được để trống');
      }

      // Gọi đến Google API
      const response = await axios.post(
        `${this.googleApiEndpoint}?key=${this.googleApiKey}`,
        {
          content: {
            parts: [{ text }],
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      // Kiểm tra định dạng response từ Google API
      if (
        response.data &&
        response.data.embedding &&
        response.data.embedding.values &&
        Array.isArray(response.data.embedding.values) &&
        response.data.embedding.values.length > 0
      ) {
        // Đảm bảo tất cả các giá trị là số
        const embeddings = response.data.embedding.values.map((val) => Number(val));

        this.logger.debug(`Đã tạo embedding thành công với ${embeddings.length} chiều`);
        return embeddings;
      } else {
        this.logger.error(`Response không hợp lệ: ${JSON.stringify(response.data)}`);
        throw new Error('Định dạng phản hồi không hợp lệ từ Google Generative Language API');
      }
    } catch (error) {
      if (error.response) {
        // Ghi log chi tiết về lỗi HTTP
        this.logger.error(
          `Google API trả về lỗi HTTP ${error.response.status}: ${JSON.stringify(
            error.response.data,
          )}`,
        );
      }
      this.logger.error(`Lỗi khi tạo embedding với Google API: ${error.message}`);
      throw error;
    }
  }
}
