import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as https from 'https';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly googleApiEndpoint: string;
  private readonly googleApiKey: string;
  private readonly retryMax: number;
  private readonly retryDelayMs: number;

  constructor(private readonly configService: ConfigService) {
    this.googleApiEndpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent';
    this.googleApiKey =
      this.configService.get<string>('GOOGLE_API_KEY');
    this.retryMax = 3;
    this.retryDelayMs = 1000;
    this.logger.log(`Initialized EmbeddingService with Google API`);
  }

  /**
   * Tạo embedding vector cho một đoạn văn bản với cơ chế thử lại
   */
  async createEmbedding(text: string): Promise<number[]> {
    this.logger.debug(`Tạo embedding cho văn bản: "${text.substring(0, 50)}..."`);

    // Validate input text
    if (!text || text.trim() === '') {
      this.logger.error('Văn bản rỗng không thể tạo embedding');
      throw new Error('Văn bản không được để trống');
    }

    return this.withRetry(async () => {
      return this.createEmbeddingWithGoogleAPI(text);
    });
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

      // Xử lý từng văn bản một, với retries
      for (const text of texts) {
        try {
          const embedding = await this.createEmbedding(text);

          // Kiểm tra embedding hợp lệ
          if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error('Embedding không hợp lệ: mảng rỗng hoặc không đúng định dạng');
          }

          results.push({ text, embedding });
        } catch (error) {
          this.logger.error(`Lỗi với văn bản cụ thể: ${error.message}`);
          // Không thêm kết quả lỗi để tránh embedding rỗng
        }
      }

      if (results.length === 0) {
        throw new Error('Không tạo được embedding cho bất kỳ văn bản nào trong batch');
      }

      return results;
    } catch (error) {
      this.logger.error(`Lỗi khi tạo embedding batch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Tạo embedding sử dụng Google Generative Language API
   */
  private async createEmbeddingWithGoogleAPI(text: string): Promise<number[]> {
    try {
      this.logger.debug(`Gọi Google API để tạo embedding cho text: "${text.substring(0, 30)}..."`);

      // Xây dựng payload đúng định dạng cho Google API
      const payload = {
        content: {
          parts: [{ text }],
        },
      };

      // Sử dụng agent tùy chỉnh để tránh lỗi SSL và tăng timeout
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        timeout: 30000,
      });

      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json',
        },
        httpsAgent,
        timeout: 30000, // Timeout 30 giây
      };

      const response = await axios.post(
        `${this.googleApiEndpoint}?key=${this.googleApiKey}`,
        payload,
        config,
      );

      // Kiểm tra phản hồi
      this.validateEmbeddingResponse(response);

      // Trích xuất và chuyển đổi embedding
      const embeddings = response.data.embedding.values.map((val) => Number(val));

      this.logger.debug(`Đã tạo embedding thành công với ${embeddings.length} chiều`);
      return embeddings;
    } catch (error) {
      if (error.response) {
        this.logger.error(
          `Google API trả về lỗi HTTP ${error.response.status}: ${JSON.stringify(
            error.response.data,
          )}`,
        );
      } else if (error.request) {
        this.logger.error(`Không nhận được phản hồi từ Google API: ${error.message}`);
      } else {
        this.logger.error(`Lỗi khi thiết lập request: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate response từ Google API
   */
  private validateEmbeddingResponse(response: AxiosResponse): void {
    // Kiểm tra status code
    if (response.status !== 200) {
      throw new Error(`Google API trả về status code không thành công: ${response.status}`);
    }

    // Kiểm tra cấu trúc dữ liệu
    if (!response.data) {
      throw new Error('Phản hồi không có dữ liệu');
    }

    if (!response.data.embedding) {
      throw new Error(`Phản hồi thiếu trường 'embedding': ${JSON.stringify(response.data)}`);
    }

    if (!response.data.embedding.values) {
      throw new Error(
        `Phản hồi thiếu trường 'embedding.values': ${JSON.stringify(response.data.embedding)}`,
      );
    }

    const values = response.data.embedding.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`'embedding.values' không phải là mảng hợp lệ: ${JSON.stringify(values)}`);
    }

    // Kiểm tra tất cả các giá trị là số
    const hasInvalidValue = values.some((val) => typeof val !== 'number' && isNaN(Number(val)));
    if (hasInvalidValue) {
      throw new Error('Mảng embedding chứa các giá trị không phải là số');
    }
  }

  /**
   * Hàm helper để thực hiện với cơ chế retry
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryMax; attempt++) {
      try {
        const result = await fn();

        // Kiểm tra nếu result là mảng embedding
        if (Array.isArray(result)) {
          if (result.length === 0) {
            throw new Error('Kết quả là mảng rỗng');
          }
        }

        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt}/${this.retryMax} failed: ${error.message}`);

        if (attempt < this.retryMax) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
          this.logger.debug(`Waiting ${delay}ms before retry ${attempt + 1}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`Thất bại sau ${this.retryMax} lần thử`);
  }
}
