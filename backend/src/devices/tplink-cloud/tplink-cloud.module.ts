import { Module } from '@nestjs/common';
import { TplinkCloudService } from './tplink-cloud.service';
import { TplinkCloudController } from './tplink-cloud.controller';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SchedulerController } from '../scheduler/scheduler.controller';
import { TapoModule } from '../tapo/tapo.module';
import { KasaModule } from '../kasa/kasa.module';

@Module({
  imports: [TapoModule, KasaModule], // Richiama i moduli
  controllers: [TplinkCloudController, SchedulerController],
  providers: [TplinkCloudService, SchedulerService],
})
export class TplinkCloudModule {}
