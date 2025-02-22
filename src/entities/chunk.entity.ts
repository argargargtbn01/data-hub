import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Chunk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  embedding: number[];

  @Column()
  fileId: string;
}
