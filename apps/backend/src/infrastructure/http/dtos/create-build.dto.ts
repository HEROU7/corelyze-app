import { BuildCategory, UseCase } from '../../../domain/enums/build.enums';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBuildDto {
  @ApiProperty({ example: 'Mi Ensamble Personalizado' })
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ enum: BuildCategory })
  @IsOptional()
  @IsEnum(BuildCategory)
  categoria?: BuildCategory;

  @ApiPropertyOptional({ enum: UseCase, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(UseCase, { each: true })
  casoUso?: UseCase[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pros?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contras?: string[];

  @ApiPropertyOptional({ example: '1440p' })
  @IsOptional()
  @IsString()
  resolucion?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  componentIds!: string[];
}
