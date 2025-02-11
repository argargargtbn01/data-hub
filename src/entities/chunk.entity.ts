import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Chunk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @Column({
    // type: 'vector',
    transformer: {
      from: (value: number[] | string) => value, // Nhận vào mảng số hoặc string (từ database)
      to: (value: number[]) => {  // Nhận vào mảng số (từ code của bạn)
        if (!value) {
           return null; // Or handle the null/undefined case as needed
        }
        return value.join(','); // Chuyển mảng số thành chuỗi, pgvector sẽ tự động xử lý
      },
    },
    nullable: true, // Quan trọng: Đặt nullable = true nếu embedding có thể null
  })
  embedding: number[] | string; // Kiểu dữ liệu là mảng số hoặc chuỗi

  @Column()
  fileId: string;
}