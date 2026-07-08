import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Eye, PlusSquare, StickyNote, Upload, FilePlus2, Send, Flag, MoreVertical } from 'lucide-react';
import { AddNoteModal } from './AddNoteModal';
import { AddTaskModal } from './AddTaskModal';
import { UploadDocModal } from './UploadDocModal';
import { FlagDuplicateModal } from './FlagDuplicateModal';

interface Account {
  id: string;
  name: string;
}

interface ActionMenuProps {
  account: Account;
}

export function ActionMenu({ account }: ActionMenuProps) {
  const navigate = useNavigate();
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 bg-background border z-50">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => navigate(`/customers/${account.id}`)}>
            <Eye className="mr-2 h-4 w-4"/>View Details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
            <StickyNote className="mr-2 h-4 w-4"/>Add Note
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTaskOpen(true)}>
            <PlusSquare className="mr-2 h-4 w-4"/>Add Task
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/quotes/new?accountId=${account.id}`)}>
            <FilePlus2 className="mr-2 h-4 w-4"/>Create Quote
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4"/>Upload Document
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/claims/new?accountId=${account.id}`)}>
            <FilePlus2 className="mr-2 h-4 w-4"/>Start Claim
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/messages/new?accountId=${account.id}`)}>
            <Send className="mr-2 h-4 w-4"/>Send Message
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFlagOpen(true)}>
            <Flag className="mr-2 h-4 w-4"/>Flag Duplicate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      <AddNoteModal open={noteOpen} onOpenChange={setNoteOpen} accountId={account.id} />
      <AddTaskModal open={taskOpen} onOpenChange={setTaskOpen} accountId={account.id} />
      <UploadDocModal open={uploadOpen} onOpenChange={setUploadOpen} accountId={account.id} />
      <FlagDuplicateModal open={flagOpen} onOpenChange={setFlagOpen} accountId={account.id} />
    </>
  );
}