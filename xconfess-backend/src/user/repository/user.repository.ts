import { EntityRepository, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { CryptoUtil } from '../../common/crypto.util';

@EntityRepository(User)
export class UserRepository extends Repository<User> {
  async findByUsername(username: string): Promise<User | null> {
    return this.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<User | null> {
    const emailHash = CryptoUtil.hash(email);
    return this.findOne({ where: { emailHash } });
  }
}
