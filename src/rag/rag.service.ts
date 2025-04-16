import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { EmbeddingService } from '../embedding/embedding.service';
import axios from 'axios';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly llmApiEndpoint: string;
  private readonly llmApiKey: string;

  constructor(
    private readonly vectorStoreService: VectorStoreService,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {
    // Lấy thông tin cấu hình API cho Language Model (OpenAI, HuggingFace...)
    this.llmApiEndpoint = this.configService.get<string>('LLM_API_ENDPOINT') || 'https://api.openai.com/v1/chat/completions';
    this.llmApiKey = this.configService.get<string>('LLM_API_KEY') || '';
  }

  /**
   * Tạo câu trả lời dựa trên câu hỏi người dùng và context từ vector store
   */
  async generateAnswer(query: string, botId: number, maxResults: number = 5): Promise<any> {
    try {
      // BƯỚC 1: Tạo embedding cho câu hỏi
      this.logger.log(`Tạo embedding cho câu hỏi: "${query}"`);
      const queryEmbedding = await this.embeddingService.createEmbedding(query);

      // BƯỚC 2: Tìm kiếm các chunks phù hợp nhất từ vector store
      this.logger.log(`Tìm ${maxResults} chunks tương đồng nhất từ vector store cho botId: ${botId}`);
      const relevantChunks = await this.vectorStoreService.searchSimilarChunks(
        queryEmbedding, 
        botId, 
        maxResults
      );

      // BƯỚC 3: Tạo context từ các chunks tìm được
      const context = relevantChunks.map((chunk, index) => 
        `[Chunk ${index + 1}] ${chunk.text}`
      ).join('\n\n');

      // BƯỚC 4: Tạo prompt cho LLM
      const prompt = this.createRagPrompt(query, context);
      
      // BƯỚC 5: Gửi prompt đến LLM API để lấy câu trả lời
      const answer = await this.queryLLM(prompt);

      // BƯỚC 6: Trả về kết quả và thông tin liên quan
      return {
        answer: answer,
        query: query,
        sources: relevantChunks.map(chunk => ({
          documentId: chunk.metadata?.documentId || 'unknown',
          source: chunk.metadata?.source || 'unknown',
          similarity: chunk.similarity || 0,
          // Trả về một phần nhỏ của text để reference
          textPreview: chunk.text.length > 150 
            ? chunk.text.substring(0, 150) + '...' 
            : chunk.text
        })),
      };
    } catch (error) {
      this.logger.error(`Lỗi khi tạo câu trả lời RAG: ${error.message}`);
      throw error;
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
      // Kiểm tra xem API key đã được cấu hình hay chưa
      if (!this.llmApiKey) {
        this.logger.warn('API key cho language model chưa được cấu hình');
        return 'Không thể kết nối với language model vì thiếu API key. Vui lòng cấu hình LLM_API_KEY trong biến môi trường.';
      }

      // Xác định loại API dựa vào endpoint URL
      if (this.llmApiEndpoint.includes('openai.com')) {
        // Gọi OpenAI API
        const response = await axios.post(
          this.llmApiEndpoint,
          {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3, // Thấp hơn để đảm bảo độ chính xác
            max_tokens: 800
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.llmApiKey}`
            }
          }
        );

        return response.data.choices[0].message.content;
      } 
      // Có thể thêm các API khác ở đây (HuggingFace, Claude, v.v.)
      else {
        // API không xác định
        this.logger.warn(`API endpoint không được hỗ trợ: ${this.llmApiEndpoint}`);
        return 'API language model không được hỗ trợ. Vui lòng cấu hình LLM_API_ENDPOINT phù hợp.';
      }
    } catch (error) {
      this.logger.error(`Lỗi khi gọi Language Model API: ${error.message}`);
      return `Lỗi khi kết nối với language model: ${error.message}`;
    }
  }
}