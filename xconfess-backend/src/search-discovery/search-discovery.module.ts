import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchDiscoveryService } from './search-discovery.service';
import { SearchDiscoveryController } from './search-discovery.controller';
import { SavedSearch } from './entities/saved-search.entity';
import { SearchHistory } from './entities/search-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavedSearch, SearchHistory])],
  providers: [SearchDiscoveryService],
  controllers: [SearchDiscoveryController],
  exports: [SearchDiscoveryService],
})
export class SearchDiscoveryModule {}
