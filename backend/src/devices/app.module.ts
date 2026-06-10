import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { TapoModule } from './tapo/tapo.module';
import { KasaModule } from './kasa/kasa.module';
import { TplinkCloudModule } from './tplink-cloud/tplink-cloud.module';

@Module({
  imports: [TapoModule, KasaModule, TplinkCloudModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
