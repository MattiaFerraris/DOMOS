import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { ZigbeeController } from './zigbee.controller';

@Module({
  controllers: [ZigbeeController],
  providers: [MqttService],
  exports: [MqttService],
})
export class ZigbeeModule {}
