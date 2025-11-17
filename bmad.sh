#!/bin/sh

    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:create-story"
    claude --permission-mode bypassPermissions -p "/bmad:bmm:workflows:story-ready"
    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:dev-story"
    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:code-review"
    claude --permission-mode bypassPermissions -p "/bmad:bmm:workflows:story-done"
exit


while true; do
    # Check workflow status at the start of each iteration
    echo "Trying to start a story"
    STATUS_OUTPUT=$(claude --permission-mode bypassPermissions "/bmad:bmm:workflows:workflow-status")

    echo "Status output:"
    echo "$STATUS_OUTPUT"

    # Exit loop if the output doesn't include create-story
    if ! echo "$STATUS_OUTPUT" | grep -q "/bmad:bmm:workflows:story-context"; then
        echo "Workflow complete: No more stories to create"
        exit 2
    fi

    echo "Running story workflow..."
    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:create-story"
#    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:story-context"
    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:story-ready"
    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:dev-story"
    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:code-review"
    claude --permission-mode bypassPermissions "/bmad:bmm:workflows:story-done"

    echo "Story complete. Moving to next iteration..."
done

# /bmad:bmm:workflows:create-story
# /bmad:bmm:workflows:story-context
##### /bmad:bmm:workflows:story-ready
# /bmad:bmm:workflows:dev-story
# /bmad:bmm:workflows:code-review
#### /bmad:bmm:workflows:story-done
