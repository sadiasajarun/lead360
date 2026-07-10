import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioProject } from './portfolio-project.entity';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';
import { PortfolioScraperService } from './portfolio-scraper.service';
import { PortfolioController } from './portfolio.controller';

// AiModule is @Global, so AiService injects without importing it.
@Module({
  imports: [TypeOrmModule.forFeature([PortfolioProject])],
  controllers: [PortfolioController],
  providers: [PortfolioRepository, PortfolioService, PortfolioScraperService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
