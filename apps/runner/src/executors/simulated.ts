import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Executor } from './types';

/**
 * Produces realistic-looking Terraform output without touching any cloud.
 * Lets the whole plan → approve → apply flow be exercised locally.
 */
export class SimulatedExecutor implements Executor {
  constructor(private readonly stepMs = 900) {}

  async execute(run: Parameters<Executor['execute']>[0], emit: (chunk: string) => void) {
    const commitSha = randomBytes(20).toString('hex');
    const step = async (line: string) => {
      emit(line + '\n');
      await sleep(this.stepMs);
    };

    await step('Initializing the backend...');
    await step('Initializing provider plugins...');
    await step('- Reusing previous version of hashicorp/aws');
    await step('Terraform has been successfully initialized!');
    await step(`Refreshing state for ${run.environment}…`);

    if (run.branch.includes('fail')) {
      emit('Error: InvalidPermission.Duplicate: the specified rule already exists\n');
      emit('  on sg.tf line 24, in resource "aws_security_group_rule" "egress"\n');
      throw new Error(`terraform ${run.action} exited with code 1`);
    }

    if (run.action === 'destroy') {
      await step('');
      await step('  - aws_instance.load_test[0]');
      await step('  - aws_instance.load_test[1]');
      await step('  - aws_security_group.load_test');
      const summary = 'Destroy complete! Resources: 3 destroyed.';
      await step('');
      emit(summary + '\n');
      return { commitSha, planSummary: summary };
    }

    await step('');
    await step('Terraform will perform the following actions:');
    await step('');
    await step('  + aws_db_parameter_group.app');
    await step('  ~ aws_db_instance.main  (parameter_group_name changes)');
    await step('  - aws_security_group_rule.legacy');
    await step('');
    const plan = 'Plan: 1 to add, 1 to change, 1 to destroy.';
    if (run.action === 'plan') {
      emit(plan + '\n');
      return { commitSha, planSummary: plan };
    }
    await step(plan);
    await step('');
    const summary = 'Apply complete! Resources: 1 added, 1 changed, 1 destroyed.';
    emit(summary + '\n');
    return { commitSha, planSummary: summary };
  }
}
