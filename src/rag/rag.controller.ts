import { Body, Controller, Post, Logger } from '@nestjs/common';
import { RagService } from './rag.service';

@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(private readonly ragService: RagService) {}

  @Post('/query')
  async queryRag(@Body() queryDto: { 
    botId: number;
    query: string;
    maxResults?: number;
  }) {
    this.logger.log(`Nhận yêu cầu RAG query: "${queryDto.query}" cho botId: ${queryDto.botId}`);
    return this.ragService.generateAnswer(
      queryDto.query, 
      queryDto.botId,
      queryDto.maxResults || 5
    );
  }
}