import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, tenant_id, export_type, format, request_id, customer_email } = await req.json();

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    // Verify user has access to tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    if (tenants.length === 0) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    switch (action) {
      case 'request_export': {
        // Create export request
        const exportRequest = await base44.asServiceRole.entities.DataExportRequest.create({
          tenant_id,
          requested_by: user.email,
          export_type: export_type || 'full_export',
          format: format || 'json',
          status: 'pending'
        });

        // Log audit
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          user_id: user.id,
          user_email: user.email,
          action_type: 'export_requested',
          entity_type: 'DataExportRequest',
          entity_id: exportRequest.id,
          new_state: { export_type, format }
        });

        return Response.json({ 
          success: true, 
          request_id: exportRequest.id,
          status: 'pending'
        });
      }

      case 'process_export': {
        if (!request_id) {
          return Response.json({ error: 'request_id required' }, { status: 400 });
        }

        const requests = await base44.asServiceRole.entities.DataExportRequest.filter({ id: request_id });
        if (requests.length === 0) {
          return Response.json({ error: 'Export request not found' }, { status: 404 });
        }

        const exportReq = requests[0];
        
        await base44.asServiceRole.entities.DataExportRequest.update(request_id, {
          status: 'processing'
        });

        try {
          let exportData = {};
          let recordCount = 0;

          // Collect data based on export type
          if (exportReq.export_type === 'full_export' || exportReq.export_type === 'gdpr_export') {
            const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
            const customers = await base44.asServiceRole.entities.Customer.filter({ tenant_id });
            const products = await base44.asServiceRole.entities.Product.filter({ tenant_id });
            const alerts = await base44.asServiceRole.entities.Alert.filter({ tenant_id });
            const tasks = await base44.asServiceRole.entities.Task.filter({ tenant_id });

            exportData = { orders, customers, products, alerts, tasks };
            recordCount = orders.length + customers.length + products.length;
          } else if (exportReq.export_type === 'orders_only') {
            exportData.orders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
            recordCount = exportData.orders.length;
          } else if (exportReq.export_type === 'customers_only') {
            exportData.customers = await base44.asServiceRole.entities.Customer.filter({ tenant_id });
            recordCount = exportData.customers.length;
          }

          // Format data
          let fileContent;
          if (exportReq.format === 'csv') {
            // Convert to CSV (simplified - just orders for now)
            const orders = exportData.orders || [];
            const headers = ['order_number', 'customer_email', 'total_revenue', 'net_profit', 'status', 'order_date'];
            const rows = orders.map(o => headers.map(h => o[h] || '').join(','));
            fileContent = [headers.join(','), ...rows].join('\n');
          } else {
            fileContent = JSON.stringify(exportData, null, 2);
          }

          // Upload file
          const blob = new Blob([fileContent], { type: 'application/json' });
          const file = new File([blob], `export_${tenant_id}_${Date.now()}.${exportReq.format}`, { type: 'application/json' });
          const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });

          // Update request with results
          await base44.asServiceRole.entities.DataExportRequest.update(request_id, {
            status: 'completed',
            file_url: uploadResult.file_url,
            file_size_bytes: fileContent.length,
            record_count: recordCount,
            completed_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
          });

          return Response.json({ 
            success: true, 
            file_url: uploadResult.file_url,
            record_count: recordCount
          });

        } catch (error) {
          await base44.asServiceRole.entities.DataExportRequest.update(request_id, {
            status: 'failed',
            error_message: error.message
          });
          throw error;
        }
      }

      case 'gdpr_delete': {
        // GDPR data deletion for a specific customer
        if (!customer_email) {
          return Response.json({ error: 'customer_email required for GDPR delete' }, { status: 400 });
        }

        // Find and anonymize customer data
        const customers = await base44.asServiceRole.entities.Customer.filter({ 
          tenant_id, 
          email: customer_email 
        });

        let deletedRecords = 0;

        for (const customer of customers) {
          // Anonymize customer record
          await base44.asServiceRole.entities.Customer.update(customer.id, {
            email: `deleted_${customer.id}@anonymized.local`,
            name: 'GDPR Deleted',
            phone: null,
            notes: 'Data deleted per GDPR request'
          });
          deletedRecords++;
        }

        // Anonymize orders
        const orders = await base44.asServiceRole.entities.Order.filter({
          tenant_id,
          customer_email
        });

        for (const order of orders) {
          await base44.asServiceRole.entities.Order.update(order.id, {
            customer_email: `deleted_${order.id}@anonymized.local`,
            customer_name: 'GDPR Deleted',
            billing_address: null,
            shipping_address: null
          });
          deletedRecords++;
        }

        // Log audit
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          user_id: user.id,
          user_email: user.email,
          action_type: 'data_deleted',
          reason: 'GDPR deletion request',
          metadata: { customer_email, records_affected: deletedRecords }
        });

        return Response.json({ 
          success: true, 
          records_deleted: deletedRecords 
        });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Data exporter error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});