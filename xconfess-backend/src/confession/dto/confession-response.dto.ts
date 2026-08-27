export class ConfessionResponseDto {
  id: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<ConfessionResponseDto>) {
    Object.assign(this, partial);
  }
}
