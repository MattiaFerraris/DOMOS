import { Module } from '@nestjs/common';
import { NenkoService } from './nenko.service';
import { NenkoController } from './nenko.controller';

@Module({
  controllers: [NenkoController],
  providers: [NenkoService],
  exports: [NenkoService],
})
export class NenkoModule {}
