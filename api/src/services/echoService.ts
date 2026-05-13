import { singleton } from "tsyringe";
import type { EchoRequestDto, EchoResponseDto } from "../schemas/echoSchema.js";

@singleton()
export class EchoService {
  public echo(input: EchoRequestDto): EchoResponseDto {
    const repeated = Array.from({ length: input.repeat }, () => input.message);

    return {
      original: input.message,
      repeat: input.repeat,
      output: repeated.join(" ")
    };
  }
}

