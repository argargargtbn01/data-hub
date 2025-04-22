import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { EmbeddingService } from '../embedding/embedding.service';
import axios from 'axios';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly vectorStoreService: VectorStoreService,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Tìm và trả về các chunks liên quan dựa trên câu hỏi người dùng
   */
  async retrieveRelevantDocuments(
    query: string,
    botId: number,
    maxResults: number = 5,
  ): Promise<any> {
    try {
      // BƯỚC 1: Tạo embedding cho câu hỏi
      this.logger.log(`Tạo embedding cho câu hỏi: "${query}"`);

      if (!query || query.trim() === '') {
        return {
          error: 'Câu hỏi không được để trống. Vui lòng cung cấp nội dung câu hỏi.',
          query: query,
        };
      }

      const queryEmbedding = await this.embeddingService.createEmbedding(query);

      // Kiểm tra embedding hợp lệ
      if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        this.logger.error('Embedding không hợp lệ cho câu hỏi');
        return {
          error: 'vector embedding invalid',
          query: query,
        };
      }

      // BƯỚC 2: Tìm kiếm các chunks phù hợp nhất từ vector store
      this.logger.log(
        `Tìm ${maxResults} chunks tương đồng nhất từ vector store cho botId: ${botId}`,
      );

      try {
        const relevantChunks = await this.vectorStoreService.searchSimilarChunks(
          queryEmbedding,
          botId,
          maxResults,
        );

        // Kiểm tra nếu không tìm thấy chunks nào
        if (!relevantChunks || relevantChunks.length === 0) {
          return {
            query: query,
          };
        }

        // BƯỚC 3: Chuẩn bị dữ liệu để trả về
        const context = relevantChunks
          .map(
            (chunk, index) =>
              `[Chunk ${index + 1}] (Nguồn: ${
                chunk.metadata?.source || 'unknown'
              }, Độ tương đồng: ${(chunk.similarity * 100).toFixed(2)}%)\n${chunk.text}`,
          )
          .join('\n\n');

        // Log context được tạo ra
        this.logger.log(`Context được tạo ra từ ${relevantChunks.length} chunks:`);
        this.logger.log(`${context.substring(0, 500)}${context.length > 500 ? '...' : ''}`);

        return {
          query: query,
          context: context,
        };
      } catch (error) {
        if (error.message === 'vector must have at least 1 dimension') {
          this.logger.error(
            'Lỗi khi tìm kiếm chunks tương tự: vector must have at least 1 dimension',
          );
          return {
            error: error.message,
            query: query,
          };
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(`Lỗi khi tìm kiếm tài liệu liên quan: ${error.message}`);

      return {
        error: error.message,
        query: query,
      };
    }
  }

  /**
   * Phương thức cũ được giữ lại để tương thích ngược
   */
  async generateAnswer(query: string, botId: number, maxResults: number = 5): Promise<any> {
    this.logger.log(`Đang xử lý yêu cầu RAG với query: "${query}" cho botId: ${botId}`);

    try {
      // BƯỚC 1: Tạo embedding cho câu hỏi
      this.logger.log(`Tạo embedding cho câu hỏi: "${query}"`);

      if (!query || query.trim() === '') {
        return {
          answer: 'Câu hỏi không được để trống. Vui lòng cung cấp nội dung câu hỏi.',
          query: query,
          sources: [],
        };
      }

      const queryEmbedding = await this.embeddingService.createEmbedding(query);

      // Kiểm tra embedding hợp lệ
      if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        this.logger.error('Embedding không hợp lệ cho câu hỏi');
        return {
          answer: 'Xin lỗi, không thể xử lý câu hỏi lúc này. Vui lòng thử lại sau.',
          query: query,
          error: 'vector embedding invalid',
          sources: [],
        };
      }

      // BƯỚC 2: Tìm kiếm các chunks phù hợp nhất từ vector store
      this.logger.log(
        `Tìm ${maxResults} chunks tương đồng nhất từ vector store cho botId: ${botId}`,
      );

      let relevantChunks;
      try {
        relevantChunks = await this.vectorStoreService.searchSimilarChunks(
          queryEmbedding,
          botId,
          maxResults,
        );

        // Kiểm tra nếu không tìm thấy chunks nào
        if (!relevantChunks || relevantChunks.length === 0) {
          this.logger.warn(
            `Không tìm thấy chunks nào tương tự cho botId=${botId} và query="${query}"`,
          );
          return {
            answer: 'Tôi không tìm thấy thông tin liên quan trong tài liệu để trả lời câu hỏi này.',
            query: query,
            sources: [],
          };
        }

        // Log chi tiết từng chunk được tìm thấy
        this.logger.log(`Đã tìm thấy ${relevantChunks.length} chunks tương tự:`);
        relevantChunks.forEach((chunk, index) => {
          this.logger.log(
            `[Chunk ${index + 1}] Similarity: ${(chunk.similarity * 100).toFixed(
              2,
            )}%, Text: "${chunk.text.substring(0, 100)}${chunk.text.length > 100 ? '...' : ''}"`,
          );
        });

        // BƯỚC 3: Tạo context từ các chunks tìm được
        const context = relevantChunks
          .map((chunk, index) => `[Chunk ${index + 1}] ${chunk.text}`)
          .join('\n\n');

        this.logger.log(`Context được tạo ra (${context.length} ký tự):`);
        this.logger.log(`${context.substring(0, 500)}${context.length > 500 ? '...' : ''}`);

        // Không gọi trực tiếp LLM nữa - thay vào đó trả về context và sources
        this.logger.log(`Trả về context và sources để mos-be xử lý LLM`);

        return {
          answer:
            'Chức năng gọi LLM đã được chuyển sang mos-be. Vui lòng cập nhật client để sử dụng API mới.',
          query: query,
          context: context,
          sources: relevantChunks.map((chunk) => ({
            documentId: chunk.metadata?.documentId || 'unknown',
            source: chunk.metadata?.source || 'unknown',
            similarity: chunk.similarity || 0,
            // Trả về một phần nhỏ của text để reference
            textPreview:
              chunk.text.length > 150 ? chunk.text.substring(0, 150) + '...' : chunk.text,
          })),
        };
      } catch (error) {
        if (error.message === 'vector must have at least 1 dimension') {
          this.logger.error(
            'Lỗi khi tìm kiếm chunks tương tự: vector must have at least 1 dimension',
          );
          return {
            answer: 'Xin lỗi, không thể xử lý câu hỏi lúc này. Vui lòng thử lại sau.',
            query: query,
            error: error.message,
            sources: [],
          };
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(`Lỗi khi tạo câu trả lời RAG: ${error.message}`);

      return {
        answer: 'Xin lỗi, đã xảy ra lỗi khi xử lý câu hỏi. Vui lòng thử lại sau.',
        query: query,
        error: error.message,
        sources: [],
      };
    }
  }

  /**
   * Tạo prompt cho language model dựa trên câu hỏi và context
   */
  private createRagPrompt(query: string, context: string): string {
    return `
Bạn là một trợ lí AI hữu ích và chỉ trả lời dựa trên thông tin được cung cấp trong context sau đây:

---CONTEXT---
${context}
---END OF CONTEXT---

Dựa trên context trên, hãy trả lời câu hỏi sau một cách chính xác và đầy đủ.
Nếu context không chứa thông tin liên quan để trả lời câu hỏi, vui lòng nói "Tôi không tìm thấy thông tin liên quan trong tài liệu để trả lời câu hỏi này."

Câu hỏi: ${query}

Trả lời:
`;
  }

  /**
   * Gửi prompt đến language model API và nhận về câu trả lời
   */
  private async queryLLM(prompt: string): Promise<string> {
    try {
      const llmApiEndpoint =
        this.configService.get<string>('LLM_API_ENDPOINT') ||
        'https://api.openai.com/v1/chat/completions';
      const llmApiKey = this.configService.get<string>('LLM_API_KEY') || '';

      // Kiểm tra xem API key đã được cấu hình hay chưa
      if (!llmApiKey) {
        this.logger.warn('API key cho language model chưa được cấu hình');
        return 'Không thể kết nối với language model vì thiếu API key. Vui lòng cấu hình LLM_API_KEY trong biến môi trường.';
      }

      // Xác định loại API dựa vào endpoint URL
      if (llmApiEndpoint.includes('openai.com')) {
        // Gọi OpenAI API
        const response = await axios.post(
          llmApiEndpoint,
          {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3, // Thấp hơn để đảm bảo độ chính xác
            max_tokens: 800,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${llmApiKey}`,
            },
          },
        );

        return response.data.choices[0].message.content;
      }
      // Có thể thêm các API khác ở đây (HuggingFace, Claude, v.v.)
      else {
        // API không xác định
        this.logger.warn(`API endpoint không được hỗ trợ: ${llmApiEndpoint}`);
        return 'API language model không được hỗ trợ. Vui lòng cấu hình LLM_API_ENDPOINT phù hợp.';
      }
    } catch (error) {
      this.logger.error(`Lỗi khi gọi Language Model API: ${error.message}`);
      return `Lỗi khi kết nối với language model: ${error.message}`;
    }
  }
}