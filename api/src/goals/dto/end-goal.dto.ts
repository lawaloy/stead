import { IsIn } from 'class-validator';
import type {
  EndGoalRequest,
  GoalStatus,
} from '../../contracts/generated/types.gen';

export class EndGoalDto implements EndGoalRequest {
  @IsIn(['completed', 'cancelled'])
  status!: Extract<GoalStatus, 'completed' | 'cancelled'>;
}
