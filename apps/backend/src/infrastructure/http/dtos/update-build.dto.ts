import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateBuildDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  casoUso?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pros?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contras?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  componentIds?: string[];
}
