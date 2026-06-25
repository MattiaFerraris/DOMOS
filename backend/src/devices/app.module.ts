import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TapoModule } from './tapo/tapo.module';
import { KasaModule } from './kasa/kasa.module';
import { TplinkCloudModule } from './tplink-cloud/tplink-cloud.module';
import { ZigbeeModule } from './zigbee/zigbee.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TapoModule,
    KasaModule,
    TplinkCloudModule,
    ZigbeeModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
