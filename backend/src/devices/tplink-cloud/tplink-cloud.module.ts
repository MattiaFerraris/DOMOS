import { Module } from '@nestjs/common';
import { TplinkCloudService } from './tplink-cloud.service';
import { TplinkCloudController } from './tplink-cloud.controller';
import { TapoModule } from '../tapo/tapo.module';
import { KasaModule } from '../kasa/kasa.module';

@Module({
  imports: [TapoModule, KasaModule], // Richiama i moduli specialisti
  controllers: [TplinkCloudController], // Questo è lo sportello aperto a React
  providers: [TplinkCloudService],
})
export class TplinkCloudModule {}
