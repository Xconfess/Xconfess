import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AnonymousConfession } from './confession.entity';
import { Tag } from './tag.entity';

@Entity('confession_tags')
@Index(['confession', 'tag'], { unique: true })
export class ConfessionTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(
    () => AnonymousConfession,
    (confession) => confession.confessionTags,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'confession_id' })
  @Index()
  confession: AnonymousConfession;

  @ManyToOne(() => Tag, (tag) => tag.confessionTags, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tag_id' })
  @Index()
  tag: Tag;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
