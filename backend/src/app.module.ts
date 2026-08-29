import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { RolesGuard } from './core/guards/roles.guard';
import { TransformInterceptor } from './core/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { UserModule } from './modules/user/user.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuthModule } from './modules/auth/auth.module';
import { LeadModule } from './modules/lead/lead.module';
import { RequirementModule } from './modules/requirement/requirement.module';
import { BudgetModule } from './modules/budget/budget.module';
import { ProposalModule } from './modules/proposal/proposal.module';
import { AuditModule } from './modules/audit/audit.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { ProjectModule } from './modules/project/project.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { AiModule } from './infrastructure/ai/ai.module';
import { StorageModule } from './infrastructure/s3/storage.module';
import { PdfModule } from './infrastructure/pdf/pdf.module';
import { DiagramModule } from './infrastructure/diagram/diagram.module';
import { KbModule } from './modules/kb/kb.module';
import { GenerationModule } from './modules/generation/generation.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DeliverablesModule } from './modules/deliverables/deliverables.module';
import { RateCardModule } from './modules/rate-card/rate-card.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { EstimateModule } from './modules/estimate/estimate.module';
import { ClientFeedbackModule } from './modules/client-feedback/client-feedback.module';
import { ProjectCaseModule } from './modules/project-case/project-case.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DATABASE_HOST', 'localhost'),
        port: +cfg.get('DATABASE_PORT', 5432),
        username: cfg.get('DATABASE_USER', 'lead360'),
        password: cfg.get('DATABASE_PASSWORD', 'lead360_dev_pw'),
        database: cfg.get('DATABASE_NAME', 'lead360'),
        // Cloud Postgres (Neon/Supabase/RDS) needs TLS; managed certs -> rejectUnauthorized:false.
        ssl: cfg.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        // Prod: migrations only. Local dev without authored migrations can auto-create the
        // schema from entities by setting DATABASE_SYNCHRONIZE=true (never set this in prod).
        synchronize: cfg.get('DATABASE_SYNCHRONIZE') === 'true',
        // Fail a bad connection fast instead of hanging the request: without a connect timeout a
        // single unreachable address stalls the whole query until the OS gives up (~2 min).
        connectTimeoutMS: 15000,
        extra: {
          connectionTimeoutMillis: 15000,
          // Neon drops idle connections; recycle ours first and keep the sockets warm so a pooled
          // connection is not found dead mid-request.
          idleTimeoutMillis: 30000,
          keepAlive: true,
          max: 10,
        },
      }),
    }),
    UserModule,
    SettingsModule,
    AuthModule,
    LeadModule,
    RequirementModule,
    BudgetModule,
    ProposalModule,
    AuditModule,
    ApprovalModule,
    ProjectModule,
    DeliveryModule,
    // Infrastructure (global) + AI layer
    AiModule,
    StorageModule,
    PdfModule,
    DiagramModule,
    KbModule,
    GenerationModule,
    AnalyticsModule,
    DeliverablesModule,
    RateCardModule,
    PortfolioModule,
    EstimateModule,
    ClientFeedbackModule,
    ProjectCaseModule,
  ],
  controllers: [AppController],
  providers: [
    // Every route is authenticated by default (JwtAuthGuard) unless marked @Public(); then role-checked.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Consistent response envelope + error shape.
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
