/**
 * Property Policy - Interests Tab
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Landmark, FileText, AlertTriangle } from 'lucide-react';
import type { PropertyInterest, PropertyEndorsement } from '@/types/commercial-property';
import { getInterestTypeLabel } from '@/hooks/usePropertyExtraction';

interface InterestsTabProps {
  interests: PropertyInterest[];
  endorsements: PropertyEndorsement[];
}

export function InterestsTab({ interests, endorsements }: InterestsTabProps) {
  const mortgagees = interests.filter((i) => ['mortgagee', 'lenders_loss_payable'].includes(i.interest_type));
  const lossPayees = interests.filter((i) => i.interest_type === 'loss_payee');

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Interests</div>
          <div className="text-2xl font-bold">{interests.length}</div>
        </Card>
        <Card className="p-4 bg-blue-50">
          <div className="text-xs text-muted-foreground">Mortgagees</div>
          <div className="text-2xl font-bold text-blue-700">{mortgagees.length}</div>
        </Card>
        <Card className="p-4 bg-green-50">
          <div className="text-xs text-muted-foreground">Loss Payees</div>
          <div className="text-2xl font-bold text-green-700">{lossPayees.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Endorsements</div>
          <div className="text-2xl font-bold">{endorsements.length}</div>
        </Card>
      </div>

      <Separator />

      {/* Interests Table */}
      {interests.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Loan #</TableHead>
                <TableHead>Location/Bldg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interests.map((interest, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge
                      variant={
                        interest.interest_type === 'mortgagee' ||
                        interest.interest_type === 'lenders_loss_payable'
                          ? 'default'
                          : 'outline'
                      }
                      className="text-xs"
                    >
                      <Landmark className="h-3 w-3 mr-1" />
                      {getInterestTypeLabel(interest.interest_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{interest.name}</TableCell>
                  <TableCell>
                    {interest.address ? (
                      <div className="text-xs">
                        <div>{interest.address.street}</div>
                        <div className="text-muted-foreground">
                          {interest.address.city}, {interest.address.state} {interest.address.zip}
                        </div>
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{interest.loan_number || 'N/A'}</TableCell>
                  <TableCell>
                    {interest.location_number ? (
                      <span className="font-mono">
                        {interest.location_number}
                        {interest.building_number ? `/${interest.building_number}` : ''}
                      </span>
                    ) : (
                      'All'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Landmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No mortgagees or loss payees found</p>
        </div>
      )}

      {/* Endorsements */}
      {endorsements.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Property Endorsements
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Form</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Edition</TableHead>
                    <TableHead className="text-center">Limitation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endorsements.map((end, i) => (
                    <TableRow key={i} className={end.is_limitation ? 'bg-amber-50' : ''}>
                      <TableCell className="font-mono">{end.form_number}</TableCell>
                      <TableCell>{end.title}</TableCell>
                      <TableCell>
                        {end.category ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {end.category.replace(/_/g, ' ')}
                          </Badge>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell>{end.edition_date || 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        {end.is_limitation ? (
                          <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
