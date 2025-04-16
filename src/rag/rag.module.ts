import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { EmbeddingModule } from 'src/embedding/embedding.module';

@Module({
  imports: [VectorStoreModule, EmbeddingModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService]
})
export class RagModule {}