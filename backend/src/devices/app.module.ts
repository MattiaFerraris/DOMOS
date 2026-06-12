import { Module } from '@nestjs/common';

import { TapoModule } from './tapo/tapo.module';
import { KasaModule } from './kasa/kasa.module';
import { TplinkCloudModule } from './tplink-cloud/tplink-cloud.module';

@Module({
  imports: [TapoModule, KasaModule, TplinkCloudModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
